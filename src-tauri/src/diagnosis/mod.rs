//! AI Detective / Copilot.
//!
//! Assembles a privacy-safe, on-device [`DiagnosisContext`] (structured
//! summaries only — never raw file contents), runs the platform
//! [`DiagnosisProvider`](provider::DiagnosisProvider) over it, and persists the
//! session and findings. Uses SpaceXAI/xAI when `XAI_API_KEY` is set; otherwise
//! offline heuristics. SQL lives in `storage::diagnosis_repo`.

pub mod llm;
pub mod provider;

use rusqlite::Connection;

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::{DiagnosisContext, DiagnosisFinding, DiagnosisSession};
use crate::process;
use crate::storage::{
    alerts_repo, crash_repo, device_repo, diagnosis_repo, health_repo, timeline_repo,
};

/// Number of most-recent crash events summarized into the context.
const RECENT_CRASHES: usize = 8;
/// Number of most-recent timeline changes summarized into the context.
const RECENT_CHANGES: usize = 5;
/// Number of top processes summarized into the context.
const TOP_PROCESSES: usize = 8;

/// Pushes `value` into `vec` if not already present (order-preserving dedup).
fn push_unique(vec: &mut Vec<String>, value: String) {
    if !vec.contains(&value) {
        vec.push(value);
    }
}

/// Returns `used / total` as a percentage, or `None` when `total` is zero.
fn pct(used: i64, total: i64) -> Option<f64> {
    if total <= 0 {
        return None;
    }
    Some((used as f64 / total as f64) * 100.0)
}

/// Assembles the on-device context summary the provider will analyze. Reads
/// only summaries from existing repos; never touches raw file contents.
///
/// When `query` is provided, also records the detected intent on the context.
pub fn assemble_context(
    conn: &Connection,
    query: Option<&str>,
) -> Result<DiagnosisContext, CoreError> {
    let latest = health_repo::latest_sample(conn)?;
    let (health_score, cpu_usage, memory_pct, disk_pct) = match &latest {
        Some(sample) => (
            Some(sample.health_score),
            Some(sample.cpu_usage),
            pct(sample.memory_used, sample.memory_total),
            pct(sample.disk_used, sample.disk_total),
        ),
        None => (None, None, None, None),
    };

    let mut active_alert_kinds = Vec::new();
    for alert in alerts_repo::list_alerts(conn)? {
        if !alert.acknowledged {
            push_unique(&mut active_alert_kinds, alert.kind);
        }
    }

    let mut recent_crash_categories = Vec::new();
    for event in crash_repo::list_events(conn)?
        .into_iter()
        .take(RECENT_CRASHES)
    {
        push_unique(&mut recent_crash_categories, event.category);
    }

    let recent_change_titles: Vec<String> = timeline_repo::list_events(conn)?
        .into_iter()
        .take(RECENT_CHANGES)
        .map(|event| event.title)
        .collect();

    let software_count = device_repo::list_snapshots(conn)?
        .first()
        .map(|snapshot| snapshot.software_count)
        .unwrap_or(0);

    // Live process summary for "slow" / resource attribution. Best-effort: if
    // process sampling fails, leave fields empty rather than aborting diagnosis.
    let (top_process_names, top_process_memory_pct) =
        process::top_process_summary(TOP_PROCESSES).unwrap_or_default();

    let query_intent = query.map(|q| provider::detect_intent(q).as_str().to_string());

    Ok(DiagnosisContext {
        health_score,
        cpu_usage,
        memory_pct,
        disk_pct,
        active_alert_kinds,
        recent_crash_categories,
        recent_change_titles,
        software_count,
        top_process_names,
        top_process_memory_pct,
        query_intent,
    })
}

/// Builds a short plain-English summary from the findings.
fn summarize(findings: &[provider::FindingDraft]) -> String {
    if findings.len() == 1 && findings[0].title == "No major issues detected" {
        return "No major issues detected from on-device telemetry.".to_string();
    }
    let count = findings.len();
    format!(
        "{count} potential issue{} identified from on-device telemetry.",
        if count == 1 { "" } else { "s" }
    )
}

/// Runs a single-shot diagnosis for `query`, persists the session and findings,
/// and returns the session. Findings are fetched separately by session id.
pub fn run_diagnosis(conn: &mut Connection, query: &str) -> Result<DiagnosisSession, CoreError> {
    let device = device_repo::ensure_local_device(conn)?;
    let context = assemble_context(conn, Some(query))?;
    let drafts = provider::default_provider().diagnose(query, &context);

    let session_id = uuid::Uuid::new_v4().to_string();
    let session = DiagnosisSession {
        id: session_id.clone(),
        device_id: device.id,
        query: query.to_string(),
        created_at: now_rfc3339()?,
        summary: summarize(&drafts),
        context,
        finding_count: drafts.len() as i64,
    };

    let findings: Vec<DiagnosisFinding> = drafts
        .into_iter()
        .enumerate()
        .map(|(index, draft)| DiagnosisFinding {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.clone(),
            order_index: index as i64,
            title: draft.title,
            cause: draft.cause,
            evidence: draft.evidence,
            confidence: draft.confidence,
            suggested_action: draft.suggested_action,
        })
        .collect();

    diagnosis_repo::insert_session(conn, &session, &findings)?;
    Ok(session)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dna::snapshot::capture_snapshot;
    use crate::storage::db;

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("enable foreign keys");
        db::run_migrations(&conn).expect("run migrations");
        conn
    }

    #[test]
    fn assemble_context_summarizes_snapshot_software() {
        let mut conn = memory_db();
        // The collector differs by platform (real registry on Windows, mock
        // elsewhere), so compare to the captured snapshot's own count.
        let snapshot = capture_snapshot(&mut conn).expect("capture snapshot");

        let context =
            assemble_context(&conn, Some("why is my pc slow?")).expect("assemble context");
        assert_eq!(context.software_count, snapshot.software_count);
        assert!(context.health_score.is_none());
        assert!(context.recent_crash_categories.is_empty());
        assert_eq!(context.query_intent.as_deref(), Some("slow"));
    }

    #[test]
    fn run_diagnosis_persists_session_and_findings() {
        let mut conn = memory_db();
        let snapshot = capture_snapshot(&mut conn).expect("capture snapshot");

        let session = run_diagnosis(&mut conn, "why is my pc slow?").expect("run diagnosis");
        assert_eq!(session.query, "why is my pc slow?");
        assert!(session.finding_count >= 1);
        assert!(!session.summary.is_empty());
        assert_eq!(session.context.query_intent.as_deref(), Some("slow"));

        let findings = diagnosis_repo::list_findings(&conn, &session.id).expect("list findings");
        assert_eq!(findings.len() as i64, session.finding_count);

        let sessions = diagnosis_repo::list_sessions(&conn).expect("list sessions");
        assert_eq!(sessions.len(), 1);
        // Context round-trips through JSON storage (count matches the snapshot,
        // whatever the platform collector produced).
        assert_eq!(sessions[0].context.software_count, snapshot.software_count);
    }
}
