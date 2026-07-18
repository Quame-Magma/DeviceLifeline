//! Behavioral security engine (not signature AV).
//!
//! Detects suspicious persistence, unsigned/high-risk processes, and privilege
//! patterns using local inventory + process data.

use rusqlite::Connection;

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::SecurityFinding;
use crate::process;
use crate::storage::{device_repo, security_repo};

/// Runs a full behavioral security scan and replaces open findings.
pub fn scan_security(conn: &Connection) -> Result<Vec<SecurityFinding>, CoreError> {
    let device = device_repo::ensure_local_device(conn)?;
    let created_at = now_rfc3339()?;
    let mut findings = Vec::new();

    findings.extend(scan_process_behavior(&device.id, &created_at)?);
    findings.extend(scan_persistence_from_config(conn, &device.id, &created_at)?);

    security_repo::clear_open(conn, &device.id)?;
    security_repo::insert_findings(conn, &findings)?;

    // Mirror high-severity into intelligence feed.
    let intel: Vec<crate::models::IntelligenceFinding> = findings
        .iter()
        .filter(|f| f.severity == "critical" || f.severity == "warning")
        .map(|f| crate::models::IntelligenceFinding {
            id: uuid::Uuid::new_v4().to_string(),
            device_id: device.id.clone(),
            engine: "security".into(),
            kind: f.category.clone(),
            severity: f.severity.clone(),
            title: f.title.clone(),
            summary: f.summary.clone(),
            evidence: f.evidence.clone(),
            confidence: f.confidence,
            suggested_action: Some(
                "Review in Security Center; remove persistence if unexpected.".into(),
            ),
            action_id: None,
            created_at: created_at.clone(),
            dismissed: false,
        })
        .collect();
    if !intel.is_empty() {
        let _ = crate::storage::intelligence_repo::insert_findings(conn, &intel);
    }

    Ok(findings)
}

fn scan_process_behavior(
    device_id: &str,
    created_at: &str,
) -> Result<Vec<SecurityFinding>, CoreError> {
    let snapshot = process::list_processes(Some(60))?;
    let mut findings = Vec::new();

    for p in snapshot.processes {
        let path_l = p.path.as_deref().unwrap_or("").to_lowercase();
        let name_l = p.name.to_lowercase();

        // Temp-directory executables.
        if path_l.contains("\\temp\\")
            || path_l.contains("/tmp/")
            || path_l.contains("\\appdata\\local\\temp\\")
        {
            findings.push(finding(
                device_id,
                created_at,
                "suspicious_path",
                "warning",
                format!("Process running from temp: {}", p.name),
                "Executables in temporary folders are a common malware pattern.",
                format!("pid={} path={}", p.pid, p.path.as_deref().unwrap_or("?")),
                75,
                p.path.clone(),
                Some(p.name.clone()),
            ));
        }

        // High risk score from process engine.
        if p.risk_score >= 70 {
            findings.push(finding(
                device_id,
                created_at,
                "high_risk_process",
                if p.risk_score >= 85 {
                    "critical"
                } else {
                    "warning"
                },
                format!("High-risk process: {}", p.name),
                "Process risk heuristics exceeded the elevated threshold.",
                format!(
                    "score={} reasons={}",
                    p.risk_score,
                    p.risk_reasons.join("; ")
                ),
                p.risk_score.min(95),
                p.path.clone(),
                Some(p.name.clone()),
            ));
        }

        // Double extension style names.
        if name_l.ends_with(".pdf.exe")
            || name_l.ends_with(".doc.exe")
            || name_l.ends_with(".jpg.exe")
        {
            findings.push(finding(
                device_id,
                created_at,
                "double_extension",
                "critical",
                format!("Double-extension executable: {}", p.name),
                "Names like document.pdf.exe are a classic social-engineering pattern.",
                format!("pid={}", p.pid),
                90,
                p.path.clone(),
                Some(p.name.clone()),
            ));
        }
    }

    Ok(findings)
}

fn scan_persistence_from_config(
    conn: &Connection,
    device_id: &str,
    created_at: &str,
) -> Result<Vec<SecurityFinding>, CoreError> {
    use crate::storage::device_repo;

    let mut findings = Vec::new();
    let snapshots = device_repo::list_snapshots(conn)?;
    let Some(latest) = snapshots.first() else {
        return Ok(findings);
    };
    let items = device_repo::list_config(conn, &latest.id)?;

    for item in items {
        let kind = item.kind.to_lowercase();
        let path_l = item.path.as_deref().unwrap_or("").to_lowercase();
        let name_l = item.name.to_lowercase();

        if kind == "startup" || kind == "scheduled_task" {
            if path_l.contains("\\temp\\")
                || path_l.contains("\\downloads\\")
                || path_l.contains("/tmp/")
            {
                findings.push(finding(
                    device_id,
                    created_at,
                    "persistence_temp",
                    "critical",
                    format!("Persistence from temp path: {}", item.name),
                    "Startup or scheduled task points at a temporary location.",
                    format!(
                        "kind={} path={}",
                        item.kind,
                        item.path.as_deref().unwrap_or("?")
                    ),
                    88,
                    item.path.clone(),
                    Some(item.name.clone()),
                ));
            }
            if path_l.contains("powershell")
                && (path_l.contains("-enc")
                    || path_l.contains("-encodedcommand")
                    || path_l.contains("downloadstring")
                    || path_l.contains("frombase64"))
            {
                findings.push(finding(
                    device_id,
                    created_at,
                    "persistence_encoded",
                    "critical",
                    format!("Encoded PowerShell persistence: {}", item.name),
                    "Encoded or download cradles in persistence are high risk.",
                    format!("path={}", item.path.as_deref().unwrap_or("?")),
                    92,
                    item.path.clone(),
                    Some(item.name.clone()),
                ));
            }
        }

        if kind == "service"
            && (name_l.contains("update") || name_l.contains("helper"))
            && path_l.contains("\\users\\")
            && path_l.contains("\\appdata\\")
        {
            findings.push(finding(
                device_id,
                created_at,
                "user_service",
                "warning",
                format!("User-profile service: {}", item.name),
                "Services hosted under a user AppData path can be persistence for malware.",
                format!("path={}", item.path.as_deref().unwrap_or("?")),
                70,
                item.path.clone(),
                Some(item.name.clone()),
            ));
        }
    }

    Ok(findings)
}

#[allow(clippy::too_many_arguments)]
fn finding(
    device_id: &str,
    created_at: &str,
    category: &str,
    severity: &str,
    title: String,
    summary: &str,
    evidence: String,
    confidence: i64,
    path: Option<String>,
    process_name: Option<String>,
) -> SecurityFinding {
    SecurityFinding {
        id: uuid::Uuid::new_v4().to_string(),
        device_id: device_id.into(),
        created_at: created_at.into(),
        category: category.into(),
        severity: severity.into(),
        title,
        summary: summary.into(),
        evidence,
        confidence,
        path,
        process_name,
        dismissed: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db;
    use rusqlite::Connection;

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        db::run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn scan_security_runs() {
        let conn = memory_db();
        let findings = scan_security(&conn).expect("scan");
        // May be empty on a clean machine; must not error.
        let _ = findings;
    }
}
