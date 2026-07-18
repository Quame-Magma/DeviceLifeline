//! Persistence for behavioral security findings.

use rusqlite::{params, Connection};

use crate::error::CoreError;
use crate::models::SecurityFinding;

pub fn insert_findings(conn: &Connection, findings: &[SecurityFinding]) -> Result<(), CoreError> {
    for f in findings {
        conn.execute(
            "INSERT INTO security_findings
             (id, device_id, created_at, category, severity, title, summary, evidence,
              confidence, path, process_name, dismissed)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
            params![
                f.id,
                f.device_id,
                f.created_at,
                f.category,
                f.severity,
                f.title,
                f.summary,
                f.evidence,
                f.confidence,
                f.path,
                f.process_name,
                f.dismissed as i64,
            ],
        )?;
    }
    Ok(())
}

pub fn list_findings(conn: &Connection, include_dismissed: bool) -> Result<Vec<SecurityFinding>, CoreError> {
    let sql = if include_dismissed {
        "SELECT id, device_id, created_at, category, severity, title, summary, evidence,
                confidence, path, process_name, dismissed
         FROM security_findings ORDER BY created_at DESC"
    } else {
        "SELECT id, device_id, created_at, category, severity, title, summary, evidence,
                confidence, path, process_name, dismissed
         FROM security_findings WHERE dismissed = 0 ORDER BY created_at DESC"
    };
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |row| {
        let dismissed: i64 = row.get(11)?;
        Ok(SecurityFinding {
            id: row.get(0)?,
            device_id: row.get(1)?,
            created_at: row.get(2)?,
            category: row.get(3)?,
            severity: row.get(4)?,
            title: row.get(5)?,
            summary: row.get(6)?,
            evidence: row.get(7)?,
            confidence: row.get(8)?,
            path: row.get(9)?,
            process_name: row.get(10)?,
            dismissed: dismissed != 0,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(CoreError::from)
}

pub fn dismiss(conn: &Connection, id: &str) -> Result<usize, CoreError> {
    let n = conn.execute(
        "UPDATE security_findings SET dismissed = 1 WHERE id = ?1",
        params![id],
    )?;
    Ok(n)
}

pub fn clear_open(conn: &Connection, device_id: &str) -> Result<(), CoreError> {
    conn.execute(
        "DELETE FROM security_findings WHERE device_id = ?1 AND dismissed = 0",
        params![device_id],
    )?;
    Ok(())
}
