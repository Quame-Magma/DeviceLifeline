//! Repository functions for the cloud-sync queue.
//!
//! All SQLite access for the sync scaffold lives here. [`enqueue`] is
//! idempotent via the table's UNIQUE natural key; reads list pending items or
//! count by status.

use rusqlite::{params, Connection};

use crate::error::CoreError;
use crate::models::SyncQueueItem;

/// Enqueues an entity for upload, ignoring it if already queued.
pub fn enqueue(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
    created_at: &str,
) -> Result<(), CoreError> {
    conn.execute(
        "INSERT OR IGNORE INTO sync_queue
            (id, entity_type, entity_id, created_at, status, attempts, synced_at)
         VALUES (?1, ?2, ?3, ?4, 'pending', 0, NULL)",
        params![
            uuid::Uuid::new_v4().to_string(),
            entity_type,
            entity_id,
            created_at,
        ],
    )?;
    Ok(())
}

/// Lists all pending items, oldest first (upload order).
pub fn list_pending(conn: &Connection) -> Result<Vec<SyncQueueItem>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, entity_type, entity_id, created_at, status, attempts, synced_at
         FROM sync_queue
         WHERE status = 'pending'
         ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map([], row_to_item)?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }
    Ok(items)
}

/// Marks an item synced (records the time and increments the attempt count).
pub fn mark_synced(conn: &Connection, id: &str, synced_at: &str) -> Result<(), CoreError> {
    conn.execute(
        "UPDATE sync_queue
         SET status = 'synced', synced_at = ?2, attempts = attempts + 1
         WHERE id = ?1",
        params![id, synced_at],
    )?;
    Ok(())
}

/// Counts queue items in the given status.
pub fn count_by_status(conn: &Connection, status: &str) -> Result<i64, CoreError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sync_queue WHERE status = ?1",
        params![status],
        |row| row.get(0),
    )?;
    Ok(count)
}

/// Maps a `sync_queue` row to a [`SyncQueueItem`].
fn row_to_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<SyncQueueItem> {
    Ok(SyncQueueItem {
        id: row.get(0)?,
        entity_type: row.get(1)?,
        entity_id: row.get(2)?,
        created_at: row.get(3)?,
        status: row.get(4)?,
        attempts: row.get(5)?,
        synced_at: row.get(6)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db;

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("enable foreign keys");
        db::run_migrations(&conn).expect("run migrations");
        conn
    }

    #[test]
    fn enqueue_is_idempotent_and_lists_pending() {
        let conn = memory_db();
        enqueue(&conn, "snapshot", "snap-1", "2026-06-08T10:00:00Z").expect("enqueue");
        // Same entity again is ignored.
        enqueue(&conn, "snapshot", "snap-1", "2026-06-08T10:05:00Z").expect("enqueue dup");
        enqueue(&conn, "health_sample", "hs-1", "2026-06-08T10:01:00Z").expect("enqueue hs");

        let pending = list_pending(&conn).expect("list pending");
        assert_eq!(pending.len(), 2);
        assert_eq!(count_by_status(&conn, "pending").expect("count"), 2);
    }

    #[test]
    fn mark_synced_moves_item_out_of_pending() {
        let conn = memory_db();
        enqueue(&conn, "snapshot", "snap-1", "2026-06-08T10:00:00Z").expect("enqueue");
        let pending = list_pending(&conn).expect("list pending");
        assert_eq!(pending.len(), 1);

        mark_synced(&conn, &pending[0].id, "2026-06-08T10:10:00Z").expect("mark synced");
        assert_eq!(count_by_status(&conn, "pending").expect("pending"), 0);
        assert_eq!(count_by_status(&conn, "synced").expect("synced"), 1);
    }
}
