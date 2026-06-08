//! Device DNA Snapshot construction and capture orchestration.

use rusqlite::Connection;

use crate::collectors::{default_software_collector, SoftwareCollector};
use crate::error::CoreError;
use crate::models::{DeviceDnaSnapshot, RawSoftware, SoftwareInventoryItem};
use crate::storage::device_repo;

/// Schema version stamped onto snapshots produced by this increment.
const SCHEMA_VERSION: i64 = 1;
/// Snapshot `source` value for user-triggered captures in this increment.
const SNAPSHOT_SOURCE: &str = "manual";

/// Returns the current UTC time formatted as an RFC3339 string.
pub fn now_rfc3339() -> Result<String, CoreError> {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .map_err(|err| CoreError::Internal(format!("timestamp formatting failed: {err}")))
}

/// Captures an installed-software snapshot using the platform default collector,
/// persists it, and returns the new [`DeviceDnaSnapshot`].
pub fn capture_software_snapshot(conn: &mut Connection) -> Result<DeviceDnaSnapshot, CoreError> {
    capture_with_collector(conn, default_software_collector().as_ref())
}

/// Captures a snapshot using the supplied collector. Splitting this out lets
/// tests inject the mock collector deterministically on any platform.
fn capture_with_collector(
    conn: &mut Connection,
    collector: &dyn SoftwareCollector,
) -> Result<DeviceDnaSnapshot, CoreError> {
    let device = device_repo::ensure_local_device(conn)?;
    let raw = collector.collect()?;

    let snapshot = DeviceDnaSnapshot {
        id: uuid::Uuid::new_v4().to_string(),
        device_id: device.id,
        captured_at: now_rfc3339()?,
        schema_version: SCHEMA_VERSION,
        source: SNAPSHOT_SOURCE.to_string(),
        software_count: raw.len() as i64,
    };

    let items: Vec<SoftwareInventoryItem> = raw
        .into_iter()
        .map(|sw| raw_to_item(&snapshot.id, sw))
        .collect();

    device_repo::insert_snapshot(conn, &snapshot, &items)?;
    Ok(snapshot)
}

/// Converts a collector [`RawSoftware`] into a persistable
/// [`SoftwareInventoryItem`] linked to `snapshot_id`.
fn raw_to_item(snapshot_id: &str, raw: RawSoftware) -> SoftwareInventoryItem {
    SoftwareInventoryItem {
        id: uuid::Uuid::new_v4().to_string(),
        snapshot_id: snapshot_id.to_string(),
        name: raw.name,
        version: raw.version,
        publisher: raw.publisher,
        install_date: raw.install_date,
        source: raw.source,
        install_location: raw.install_location,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::collectors::software::MockSoftwareCollector;
    use crate::storage::{db, device_repo};

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("enable foreign keys");
        db::run_migrations(&conn).expect("run migrations");
        conn
    }

    #[test]
    fn capture_persists_snapshot_and_items() {
        let mut conn = memory_db();
        let collector = MockSoftwareCollector::new();

        let snapshot = capture_with_collector(&mut conn, &collector).expect("capture snapshot");

        assert_eq!(snapshot.software_count, 6);
        assert_eq!(snapshot.schema_version, SCHEMA_VERSION);
        assert_eq!(snapshot.source, SNAPSHOT_SOURCE);

        let persisted = device_repo::get_snapshot(&conn, &snapshot.id)
            .expect("get snapshot")
            .expect("snapshot exists");
        assert_eq!(persisted.software_count, 6);

        let items = device_repo::list_software(&conn, &snapshot.id).expect("list software");
        assert_eq!(items.len(), 6);
        assert!(items.iter().all(|item| item.snapshot_id == snapshot.id));
        assert!(items.iter().all(|item| item.source == "mock"));
    }
}
