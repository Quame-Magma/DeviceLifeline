//! Repository functions for [`ActionAudit`] persistence.
//!
//! All SQLite access for the Vision 2.0 action-audit ledger lives here.

use rusqlite::{params, Connection};

use crate::error::CoreError;
use crate::models::ActionAudit;

/// Inserts a single action-audit row.
pub fn insert_action(conn: &Connection, action: &ActionAudit) -> Result<(), CoreError> {
    conn.execute(
        "INSERT INTO action_audit
            (id, device_id, action_type, risk_tier, title, detail, status,
             preview, result_message, created_at, finished_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            action.id,
            action.device_id,
            action.action_type,
            action.risk_tier,
            action.title,
            action.detail,
            action.status,
            action.preview,
            action.result_message,
            action.created_at,
            action.finished_at,
        ],
    )?;
    Ok(())
}

/// Updates status / result fields when an action finishes (or progresses).
pub fn complete_action(
    conn: &Connection,
    id: &str,
    status: &str,
    result_message: Option<&str>,
    finished_at: &str,
) -> Result<usize, CoreError> {
    let updated = conn.execute(
        "UPDATE action_audit
         SET status = ?1, result_message = ?2, finished_at = ?3
         WHERE id = ?4",
        params![status, result_message, finished_at, id],
    )?;
    Ok(updated)
}

/// Lists action-audit rows newest first.
pub fn list_actions(conn: &Connection) -> Result<Vec<ActionAudit>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, device_id, action_type, risk_tier, title, detail, status,
                preview, result_message, created_at, finished_at
         FROM action_audit
         ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], row_to_action)?;
    let mut actions = Vec::new();
    for row in rows {
        actions.push(row?);
    }
    Ok(actions)
}

/// Maps an `action_audit` row to an [`ActionAudit`].
fn row_to_action(row: &rusqlite::Row<'_>) -> rusqlite::Result<ActionAudit> {
    Ok(ActionAudit {
        id: row.get(0)?,
        device_id: row.get(1)?,
        action_type: row.get(2)?,
        risk_tier: row.get(3)?,
        title: row.get(4)?,
        detail: row.get(5)?,
        status: row.get(6)?,
        preview: row.get(7)?,
        result_message: row.get(8)?,
        created_at: row.get(9)?,
        finished_at: row.get(10)?,
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

    #[test]
    fn insert_complete_list_round_trip() {
        let conn = memory_db();
        let device = device_repo::ensure_local_device(&conn).expect("ensure device");

        let action = ActionAudit {
            id: "a1".to_string(),
            device_id: device.id,
            action_type: "safe_cleanup_preview".to_string(),
            risk_tier: "safe".to_string(),
            title: "Preview cleanup".to_string(),
            detail: Some("temp files".to_string()),
            status: "proposed".to_string(),
            preview: Some(r#"{"files":3}"#.to_string()),
            result_message: None,
            created_at: "2026-07-16T10:00:00Z".to_string(),
            finished_at: None,
        };
        insert_action(&conn, &action).expect("insert");

        complete_action(
            &conn,
            "a1",
            "completed",
            Some("preview only"),
            "2026-07-16T10:01:00Z",
        )
        .expect("complete");

        let listed = list_actions(&conn).expect("list");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].status, "completed");
        assert_eq!(listed[0].result_message.as_deref(), Some("preview only"));
        assert_eq!(
            listed[0].finished_at.as_deref(),
            Some("2026-07-16T10:01:00Z")
        );
    }
}
