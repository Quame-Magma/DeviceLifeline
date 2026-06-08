//! Repository functions for AI Detective diagnosis sessions and findings.
//!
//! All SQLite access for the diagnosis slice lives here. [`insert_session`]
//! writes the session (with its [`DiagnosisContext`] serialized to JSON) and
//! all findings in one transaction. The context is (de)serialized outside the
//! rusqlite row mapper so serde errors map cleanly to [`CoreError`].

use rusqlite::{params, Connection};

use crate::error::CoreError;
use crate::models::{DiagnosisContext, DiagnosisFinding, DiagnosisSession};

/// Raw `diagnosis_sessions` row, before the context JSON is parsed.
struct SessionRow {
    id: String,
    device_id: String,
    query: String,
    created_at: String,
    summary: String,
    context_json: String,
    finding_count: i64,
}

/// Inserts a session (serializing its context) and its findings in one
/// transaction. Either everything commits or nothing does.
pub fn insert_session(
    conn: &mut Connection,
    session: &DiagnosisSession,
    findings: &[DiagnosisFinding],
) -> Result<(), CoreError> {
    let context_json = serde_json::to_string(&session.context)
        .map_err(|err| CoreError::Internal(format!("context serialization failed: {err}")))?;

    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO diagnosis_sessions
            (id, device_id, query, created_at, summary, context_json, finding_count)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            session.id,
            session.device_id,
            session.query,
            session.created_at,
            session.summary,
            context_json,
            session.finding_count,
        ],
    )?;
    for finding in findings {
        tx.execute(
            "INSERT INTO diagnosis_findings
                (id, session_id, order_index, title, cause, evidence, confidence, suggested_action)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                finding.id,
                finding.session_id,
                finding.order_index,
                finding.title,
                finding.cause,
                finding.evidence,
                finding.confidence,
                finding.suggested_action,
            ],
        )?;
    }
    tx.commit()?;
    Ok(())
}

/// Lists all diagnosis sessions, newest first (`created_at DESC`).
pub fn list_sessions(conn: &Connection) -> Result<Vec<DiagnosisSession>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, device_id, query, created_at, summary, context_json, finding_count
         FROM diagnosis_sessions
         ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], row_to_session_row)?;
    let mut sessions = Vec::new();
    for row in rows {
        sessions.push(build_session(row?)?);
    }
    Ok(sessions)
}

/// Lists the findings for a session, ordered by `order_index`.
pub fn list_findings(
    conn: &Connection,
    session_id: &str,
) -> Result<Vec<DiagnosisFinding>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, session_id, order_index, title, cause, evidence, confidence, suggested_action
         FROM diagnosis_findings
         WHERE session_id = ?1
         ORDER BY order_index",
    )?;
    let rows = stmt.query_map(params![session_id], row_to_finding)?;
    let mut findings = Vec::new();
    for row in rows {
        findings.push(row?);
    }
    Ok(findings)
}

/// Parses a [`SessionRow`]'s context JSON into a full [`DiagnosisSession`].
fn build_session(row: SessionRow) -> Result<DiagnosisSession, CoreError> {
    let context: DiagnosisContext = serde_json::from_str(&row.context_json)
        .map_err(|err| CoreError::Internal(format!("context parse failed: {err}")))?;
    Ok(DiagnosisSession {
        id: row.id,
        device_id: row.device_id,
        query: row.query,
        created_at: row.created_at,
        summary: row.summary,
        context,
        finding_count: row.finding_count,
    })
}

/// Maps a `diagnosis_sessions` row to a [`SessionRow`].
fn row_to_session_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SessionRow> {
    Ok(SessionRow {
        id: row.get(0)?,
        device_id: row.get(1)?,
        query: row.get(2)?,
        created_at: row.get(3)?,
        summary: row.get(4)?,
        context_json: row.get(5)?,
        finding_count: row.get(6)?,
    })
}

/// Maps a `diagnosis_findings` row to a [`DiagnosisFinding`].
fn row_to_finding(row: &rusqlite::Row<'_>) -> rusqlite::Result<DiagnosisFinding> {
    Ok(DiagnosisFinding {
        id: row.get(0)?,
        session_id: row.get(1)?,
        order_index: row.get(2)?,
        title: row.get(3)?,
        cause: row.get(4)?,
        evidence: row.get(5)?,
        confidence: row.get(6)?,
        suggested_action: row.get(7)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::DiagnosisContext;
    use crate::storage::{db, device_repo};

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("enable foreign keys");
        db::run_migrations(&conn).expect("run migrations");
        conn
    }

    #[test]
    fn insert_and_list_round_trips_context_and_findings() {
        let mut conn = memory_db();
        let device = device_repo::ensure_local_device(&conn).expect("ensure device");

        let session = DiagnosisSession {
            id: "sess-1".to_string(),
            device_id: device.id,
            query: "why slow?".to_string(),
            created_at: "2026-06-08T10:00:00Z".to_string(),
            summary: "1 potential issue identified.".to_string(),
            context: DiagnosisContext {
                health_score: Some(42),
                memory_pct: Some(91.0),
                software_count: 6,
                active_alert_kinds: vec!["memory_critical".to_string()],
                ..Default::default()
            },
            finding_count: 1,
        };
        let findings = vec![DiagnosisFinding {
            id: "find-1".to_string(),
            session_id: "sess-1".to_string(),
            order_index: 0,
            title: "High memory pressure".to_string(),
            cause: "c".to_string(),
            evidence: "e".to_string(),
            confidence: 80,
            suggested_action: "a".to_string(),
        }];

        insert_session(&mut conn, &session, &findings).expect("insert session");

        let sessions = list_sessions(&conn).expect("list sessions");
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].context.health_score, Some(42));
        assert_eq!(
            sessions[0].context.active_alert_kinds,
            vec!["memory_critical"]
        );

        let listed = list_findings(&conn, "sess-1").expect("list findings");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].title, "High memory pressure");
        assert_eq!(listed[0].confidence, 80);
    }
}
