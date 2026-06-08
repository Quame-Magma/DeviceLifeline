//! Cloud-sync scaffold (offline queue).
//!
//! Snapshots and health samples are enqueued locally on capture. A
//! [`SyncClient`] drains the queue; [`NoopSyncClient`] is the default and
//! reports "not configured", so items stay queued until a real
//! `SupabaseSyncClient` (upload + auth) is dropped in behind
//! [`default_sync_client`] — mirroring the real-vs-mock collector pattern.

use rusqlite::Connection;

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::SyncQueueItem;
use crate::storage::sync_repo;

/// Uploads queued entities to a cloud backend.
pub trait SyncClient: Send + Sync {
    /// Whether a cloud backend is configured and able to upload.
    fn is_configured(&self) -> bool;
    /// Uploads a single queued item.
    fn upload(&self, item: &SyncQueueItem) -> Result<(), CoreError>;
}

/// The default client: no cloud backend configured. `upload` always errors, so
/// items remain queued until a real client is configured.
pub struct NoopSyncClient;

impl NoopSyncClient {
    /// Creates a new no-op client.
    pub fn new() -> Self {
        NoopSyncClient
    }
}

impl Default for NoopSyncClient {
    fn default() -> Self {
        Self::new()
    }
}

impl SyncClient for NoopSyncClient {
    fn is_configured(&self) -> bool {
        false
    }

    fn upload(&self, _item: &SyncQueueItem) -> Result<(), CoreError> {
        Err(CoreError::Internal(
            "cloud sync is not configured".to_string(),
        ))
    }
}

/// Returns the configured [`SyncClient`]. Currently always [`NoopSyncClient`];
/// a credentialed `SupabaseSyncClient` drops in here later.
pub fn default_sync_client() -> Box<dyn SyncClient> {
    Box::new(NoopSyncClient::new())
}

/// Drains the pending queue via `client`, marking each successful upload as
/// synced. Returns the number synced. When the client is not configured this is
/// a no-op (items stay pending).
pub fn process_queue(conn: &Connection, client: &dyn SyncClient) -> Result<i64, CoreError> {
    if !client.is_configured() {
        return Ok(0);
    }
    let now = now_rfc3339()?;
    let mut synced = 0;
    for item in sync_repo::list_pending(conn)? {
        if client.upload(&item).is_ok() {
            sync_repo::mark_synced(conn, &item.id, &now)?;
            synced += 1;
        }
    }
    Ok(synced)
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

    /// A configured client that uploads everything successfully.
    struct OkClient;
    impl SyncClient for OkClient {
        fn is_configured(&self) -> bool {
            true
        }
        fn upload(&self, _item: &SyncQueueItem) -> Result<(), CoreError> {
            Ok(())
        }
    }

    #[test]
    fn noop_client_leaves_items_pending() {
        let conn = memory_db();
        sync_repo::enqueue(&conn, "snapshot", "snap-1", "2026-06-08T10:00:00Z").expect("enqueue");

        let synced = process_queue(&conn, &NoopSyncClient::new()).expect("process");
        assert_eq!(synced, 0);
        assert_eq!(
            sync_repo::count_by_status(&conn, "pending").expect("pending"),
            1
        );
    }

    #[test]
    fn configured_client_drains_the_queue() {
        let conn = memory_db();
        sync_repo::enqueue(&conn, "snapshot", "snap-1", "2026-06-08T10:00:00Z").expect("enqueue 1");
        sync_repo::enqueue(&conn, "health_sample", "hs-1", "2026-06-08T10:01:00Z")
            .expect("enqueue 2");

        let synced = process_queue(&conn, &OkClient).expect("process");
        assert_eq!(synced, 2);
        assert_eq!(
            sync_repo::count_by_status(&conn, "pending").expect("pending"),
            0
        );
        assert_eq!(
            sync_repo::count_by_status(&conn, "synced").expect("synced"),
            2
        );
    }
}
