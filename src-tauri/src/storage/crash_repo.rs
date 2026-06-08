//! Repository functions for [`CrashEvent`] persistence.
//!
//! All SQLite access for the Crash Intelligence slice lives here. Inserts use a
//! `&mut Connection` (one transaction per batch) with `INSERT OR IGNORE`, so a
//! re-scan of the same events is idempotent (matched by the table's UNIQUE
//! natural key); reads use `&Connection`.

use rusqlite::{params, Connection};

use crate::error::CoreError;
use crate::models::CrashEvent;

/// Inserts a batch of crash events inside a single transaction, ignoring any
/// whose natural key already exists. Either every new event commits or none do.
pub fn insert_events(conn: &mut Connection, events: &[CrashEvent]) -> Result<(), CoreError> {
    let tx = conn.transaction()?;
    for event in events {
        tx.execute(
            "INSERT OR IGNORE INTO crash_events
                (id, device_id, occurred_at, captured_at, category, severity,
                 source, title, detail, event_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                event.id,
                event.device_id,
                event.occurred_at,
                event.captured_at,
                event.category,
                event.severity,
                event.source,
                event.title,
                event.detail,
                event.event_id,
            ],
        )?;
    }
    tx.commit()?;
    Ok(())
}

/// Lists all crash events, newest first (`occurred_at DESC`), then by title for
/// a stable ordering.
pub fn list_events(conn: &Connection) -> Result<Vec<CrashEvent>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, device_id, occurred_at, captured_at, category, severity,
                source, title, detail, event_id
         FROM crash_events
         ORDER BY occurred_at DESC, title",
    )?;
    let rows = stmt.query_map([], row_to_crash_event)?;
    let mut events = Vec::new();
    for row in rows {
        events.push(row?);
    }
    Ok(events)
}

/// Maps a `crash_events` row to a [`CrashEvent`].
fn row_to_crash_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<CrashEvent> {
    Ok(CrashEvent {
        id: row.get(0)?,
        device_id: row.get(1)?,
        occurred_at: row.get(2)?,
        captured_at: row.get(3)?,
        category: row.get(4)?,
        severity: row.get(5)?,
        source: row.get(6)?,
        title: row.get(7)?,
        detail: row.get(8)?,
        event_id: row.get(9)?,
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

    fn make_event(
        id: &str,
        device_id: &str,
        occurred_at: &str,
        category: &str,
        title: &str,
    ) -> CrashEvent {
        CrashEvent {
            id: id.to_string(),
            device_id: device_id.to_string(),
            occurred_at: occurred_at.to_string(),
            captured_at: "2026-06-08T00:00:00Z".to_string(),
            category: category.to_string(),
            severity: "error".to_string(),
            source: "mock".to_string(),
            title: title.to_string(),
            detail: None,
            event_id: Some(1000),
        }
    }

    #[test]
    fn insert_lists_newest_first_and_dedups() {
        let mut conn = memory_db();
        let device = device_repo::ensure_local_device(&conn).expect("ensure device");

        let batch = vec![
            make_event(
                "c1",
                &device.id,
                "2026-06-07T10:00:00Z",
                "app_crash",
                "Application crash",
            ),
            make_event(
                "c2",
                &device.id,
                "2026-06-07T11:00:00Z",
                "bsod",
                "System crash (BSOD / bugcheck)",
            ),
        ];
        insert_events(&mut conn, &batch).expect("insert batch");

        let listed = list_events(&conn).expect("list events");
        assert_eq!(listed.len(), 2);
        // Newest first by occurred_at.
        assert_eq!(listed[0].id, "c2");
        assert_eq!(listed[1].id, "c1");

        // Re-inserting an event with the same natural key (even a new id) is
        // ignored, so the count is unchanged.
        let dup = vec![make_event(
            "c3",
            &device.id,
            "2026-06-07T10:00:00Z",
            "app_crash",
            "Application crash",
        )];
        insert_events(&mut conn, &dup).expect("insert dup");
        assert_eq!(list_events(&conn).expect("re-list").len(), 2);
    }
}
