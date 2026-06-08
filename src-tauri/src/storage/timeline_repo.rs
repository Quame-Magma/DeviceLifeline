//! Repository functions for [`TimelineEvent`] persistence.
//!
//! All SQLite access for the Performance Timeline slice lives here. Inserts use
//! a `&mut Connection` (one transaction per batch); reads use `&Connection`.

use rusqlite::{params, Connection};

use crate::error::CoreError;
use crate::models::TimelineEvent;

/// Inserts a batch of timeline events inside a single transaction. Either every
/// event commits or none do.
pub fn insert_events(conn: &mut Connection, events: &[TimelineEvent]) -> Result<(), CoreError> {
    let tx = conn.transaction()?;
    for event in events {
        tx.execute(
            "INSERT INTO timeline_events
                (id, device_id, snapshot_id, previous_snapshot_id,
                 event_type, category, title, detail, occurred_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                event.id,
                event.device_id,
                event.snapshot_id,
                event.previous_snapshot_id,
                event.event_type,
                event.category,
                event.title,
                event.detail,
                event.occurred_at,
            ],
        )?;
    }
    tx.commit()?;
    Ok(())
}

/// Lists all timeline events, newest first then by category and title for a
/// stable, grouped ordering.
pub fn list_events(conn: &Connection) -> Result<Vec<TimelineEvent>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, device_id, snapshot_id, previous_snapshot_id,
                event_type, category, title, detail, occurred_at
         FROM timeline_events
         ORDER BY occurred_at DESC, category, title",
    )?;
    let rows = stmt.query_map([], row_to_timeline_event)?;
    let mut events = Vec::new();
    for row in rows {
        events.push(row?);
    }
    Ok(events)
}

/// Maps a `timeline_events` row to a [`TimelineEvent`].
fn row_to_timeline_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<TimelineEvent> {
    Ok(TimelineEvent {
        id: row.get(0)?,
        device_id: row.get(1)?,
        snapshot_id: row.get(2)?,
        previous_snapshot_id: row.get(3)?,
        event_type: row.get(4)?,
        category: row.get(5)?,
        title: row.get(6)?,
        detail: row.get(7)?,
        occurred_at: row.get(8)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::DeviceDnaSnapshot;
    use crate::storage::{db, device_repo};

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("enable foreign keys");
        db::run_migrations(&conn).expect("run migrations");
        conn
    }

    #[test]
    fn insert_and_list_round_trip() {
        let mut conn = memory_db();
        let device = device_repo::ensure_local_device(&conn).expect("ensure device");

        let snapshot = DeviceDnaSnapshot {
            id: uuid::Uuid::new_v4().to_string(),
            device_id: device.id.clone(),
            captured_at: "2026-06-08T00:00:00Z".to_string(),
            schema_version: 1,
            source: "manual".to_string(),
            software_count: 0,
            config_count: 0,
        };
        device_repo::insert_snapshot(&mut conn, &snapshot, &[], &[]).expect("insert snapshot");

        let events = vec![
            TimelineEvent {
                id: uuid::Uuid::new_v4().to_string(),
                device_id: device.id.clone(),
                snapshot_id: snapshot.id.clone(),
                previous_snapshot_id: None,
                event_type: "software_install".to_string(),
                category: "software".to_string(),
                title: "Installed Zeta".to_string(),
                detail: Some("1.0".to_string()),
                occurred_at: "2026-06-08T00:00:00Z".to_string(),
            },
            TimelineEvent {
                id: uuid::Uuid::new_v4().to_string(),
                device_id: device.id.clone(),
                snapshot_id: snapshot.id.clone(),
                previous_snapshot_id: Some(snapshot.id.clone()),
                event_type: "config_added".to_string(),
                category: "config".to_string(),
                title: "Added service: Alpha".to_string(),
                detail: None,
                occurred_at: "2026-06-08T00:00:00Z".to_string(),
            },
        ];

        insert_events(&mut conn, &events).expect("insert events");

        let listed = list_events(&conn).expect("list events");
        assert_eq!(listed.len(), 2);
        // Same occurred_at, so ordered by category: "config" before "software".
        assert_eq!(listed[0].category, "config");
        assert_eq!(listed[0].title, "Added service: Alpha");
        assert_eq!(listed[0].previous_snapshot_id.as_deref(), Some(snapshot.id.as_str()));
        assert_eq!(listed[1].category, "software");
        assert_eq!(listed[1].detail.as_deref(), Some("1.0"));
        assert_eq!(listed[1].previous_snapshot_id, None);
    }
}
