//! Repository functions for [`IntelligenceFinding`] persistence.
//!
//! All SQLite access for the Vision 2.0 intelligence findings spine lives here.

use rusqlite::{params, Connection};

use crate::error::CoreError;
use crate::models::IntelligenceFinding;

/// Inserts a batch of intelligence findings.
pub fn insert_findings(conn: &Connection, findings: &[IntelligenceFinding]) -> Result<(), CoreError> {
    for finding in findings {
        conn.execute(
            "INSERT INTO intelligence_findings
                (id, device_id, engine, kind, severity, title, summary, evidence,
                 confidence, suggested_action, action_id, created_at, dismissed)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                finding.id,
                finding.device_id,
                finding.engine,
                finding.kind,
                finding.severity,
                finding.title,
                finding.summary,
                finding.evidence,
                finding.confidence,
                finding.suggested_action,
                finding.action_id,
                finding.created_at,
                finding.dismissed as i64,
            ],
        )?;
    }
    Ok(())
}

/// Lists intelligence findings, non-dismissed first then newest.
/// When `include_dismissed` is false, dismissed rows are excluded.
pub fn list_findings(
    conn: &Connection,
    include_dismissed: bool,
) -> Result<Vec<IntelligenceFinding>, CoreError> {
    let sql = if include_dismissed {
        "SELECT id, device_id, engine, kind, severity, title, summary, evidence,
                confidence, suggested_action, action_id, created_at, dismissed
         FROM intelligence_findings
         ORDER BY dismissed ASC, created_at DESC"
    } else {
        "SELECT id, device_id, engine, kind, severity, title, summary, evidence,
                confidence, suggested_action, action_id, created_at, dismissed
         FROM intelligence_findings
         WHERE dismissed = 0
         ORDER BY created_at DESC"
    };
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], row_to_finding)?;
    let mut findings = Vec::new();
    for row in rows {
        findings.push(row?);
    }
    Ok(findings)
}

/// Counts open (non-dismissed) findings.
pub fn count_open(conn: &Connection) -> Result<i64, CoreError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM intelligence_findings WHERE dismissed = 0",
        [],
        |row| row.get(0),
    )?;
    Ok(count)
}

/// Marks a finding dismissed. Returns the number of rows updated.
pub fn dismiss(conn: &Connection, id: &str) -> Result<usize, CoreError> {
    let updated = conn.execute(
        "UPDATE intelligence_findings SET dismissed = 1 WHERE id = ?1",
        params![id],
    )?;
    Ok(updated)
}

/// Maps an `intelligence_findings` row to an [`IntelligenceFinding`].
fn row_to_finding(row: &rusqlite::Row<'_>) -> rusqlite::Result<IntelligenceFinding> {
    let dismissed_i: i64 = row.get(12)?;
    Ok(IntelligenceFinding {
        id: row.get(0)?,
        device_id: row.get(1)?,
        engine: row.get(2)?,
        kind: row.get(3)?,
        severity: row.get(4)?,
        title: row.get(5)?,
        summary: row.get(6)?,
        evidence: row.get(7)?,
        confidence: row.get(8)?,
        suggested_action: row.get(9)?,
        action_id: row.get(10)?,
        created_at: row.get(11)?,
        dismissed: dismissed_i != 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{db, device_repo};

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("enable foreign keys");
        db::run_migrations(&conn).expect("run migrations");
        conn
    }

    fn make_finding(id: &str, device_id: &str, dismissed: bool) -> IntelligenceFinding {
        IntelligenceFinding {
            id: id.to_string(),
            device_id: device_id.to_string(),
            engine: "process".to_string(),
            kind: "high_memory".to_string(),
            severity: "warning".to_string(),
            title: "High memory".to_string(),
            summary: "A process is using a lot of memory.".to_string(),
            evidence: "memory > 500MB".to_string(),
            confidence: 70,
            suggested_action: Some("Review the process".to_string()),
            action_id: None,
            created_at: "2026-07-16T10:00:00Z".to_string(),
            dismissed,
        }
    }

    #[test]
    fn insert_list_dismiss_round_trip() {
        let conn = memory_db();
        let device = device_repo::ensure_local_device(&conn).expect("ensure device");

        insert_findings(
            &conn,
            &[
                make_finding("f1", &device.id, false),
                make_finding("f2", &device.id, false),
            ],
        )
        .expect("insert");

        let open = list_findings(&conn, false).expect("list open");
        assert_eq!(open.len(), 2);
        assert_eq!(count_open(&conn).expect("count"), 2);

        dismiss(&conn, "f1").expect("dismiss");
        assert_eq!(count_open(&conn).expect("count"), 1);
        let open = list_findings(&conn, false).expect("list open");
        assert_eq!(open.len(), 1);
        assert_eq!(open[0].id, "f2");
    }
}
