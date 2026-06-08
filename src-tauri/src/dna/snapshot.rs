//! Device DNA Snapshot construction and capture orchestration.

use rusqlite::Connection;

use crate::collectors::{
    default_config_collector, default_software_collector, ConfigCollector, SoftwareCollector,
};
use crate::error::CoreError;
use crate::models::{ConfigItem, DeviceDnaSnapshot, RawConfig, RawSoftware, SoftwareInventoryItem};
use crate::storage::{device_repo, timeline_repo};
use crate::timeline::diff;

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

/// Captures a Device DNA snapshot (software AND system configuration) using the
/// platform default collectors, persists it, and returns the new
/// [`DeviceDnaSnapshot`].
pub fn capture_snapshot(conn: &mut Connection) -> Result<DeviceDnaSnapshot, CoreError> {
    capture_with_collectors(
        conn,
        default_software_collector().as_ref(),
        default_config_collector().as_ref(),
    )
}

/// Captures a snapshot using the supplied collectors. Splitting this out lets
/// tests inject the mock collectors deterministically on any platform.
fn capture_with_collectors(
    conn: &mut Connection,
    software: &dyn SoftwareCollector,
    config: &dyn ConfigCollector,
) -> Result<DeviceDnaSnapshot, CoreError> {
    let device = device_repo::ensure_local_device(conn)?;
    // Capture the prior snapshot BEFORE inserting the new one so the diff has a
    // baseline to compare against.
    let previous = device_repo::latest_snapshot_for_device(conn, &device.id)?;

    let raw_software = software.collect()?;
    let raw_config = config.collect()?;

    let snapshot = DeviceDnaSnapshot {
        id: uuid::Uuid::new_v4().to_string(),
        device_id: device.id,
        captured_at: now_rfc3339()?,
        schema_version: SCHEMA_VERSION,
        source: SNAPSHOT_SOURCE.to_string(),
        software_count: raw_software.len() as i64,
        config_count: raw_config.len() as i64,
    };

    let software_items: Vec<SoftwareInventoryItem> = raw_software
        .into_iter()
        .map(|sw| raw_to_item(&snapshot.id, sw))
        .collect();
    let config_items: Vec<ConfigItem> = raw_config
        .into_iter()
        .map(|cfg| raw_to_config(&snapshot.id, cfg))
        .collect();

    device_repo::insert_snapshot(conn, &snapshot, &software_items, &config_items)?;

    if let Some(prev) = previous {
        let prev_software = device_repo::list_software(conn, &prev.id)?;
        let prev_config = device_repo::list_config(conn, &prev.id)?;
        let events = diff::compute_events(
            &snapshot,
            &prev,
            &prev_software,
            &software_items,
            &prev_config,
            &config_items,
        );
        if !events.is_empty() {
            timeline_repo::insert_events(conn, &events)?;
        }
    }

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

/// Converts a collector [`RawConfig`] into a persistable [`ConfigItem`] linked
/// to `snapshot_id`.
fn raw_to_config(snapshot_id: &str, raw: RawConfig) -> ConfigItem {
    ConfigItem {
        id: uuid::Uuid::new_v4().to_string(),
        snapshot_id: snapshot_id.to_string(),
        kind: raw.kind,
        name: raw.name,
        status: raw.status,
        path: raw.path,
        publisher: raw.publisher,
        source: raw.source,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::collectors::config::MockConfigCollector;
    use crate::collectors::software::MockSoftwareCollector;
    use crate::storage::{db, device_repo, timeline_repo};

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
        let software = MockSoftwareCollector::new();
        let config = MockConfigCollector::new();
        let expected_config = config.collect().expect("mock config").len() as i64;

        let snapshot =
            capture_with_collectors(&mut conn, &software, &config).expect("capture snapshot");

        assert_eq!(snapshot.software_count, 6);
        assert_eq!(snapshot.config_count, expected_config);
        assert_eq!(snapshot.schema_version, SCHEMA_VERSION);
        assert_eq!(snapshot.source, SNAPSHOT_SOURCE);

        let persisted = device_repo::get_snapshot(&conn, &snapshot.id)
            .expect("get snapshot")
            .expect("snapshot exists");
        assert_eq!(persisted.software_count, 6);
        assert_eq!(persisted.config_count, expected_config);

        let items = device_repo::list_software(&conn, &snapshot.id).expect("list software");
        assert_eq!(items.len(), 6);
        assert!(items.iter().all(|item| item.snapshot_id == snapshot.id));
        assert!(items.iter().all(|item| item.source == "mock"));

        let config_rows = device_repo::list_config(&conn, &snapshot.id).expect("list config");
        assert_eq!(config_rows.len() as i64, expected_config);
        assert!(config_rows
            .iter()
            .all(|item| item.snapshot_id == snapshot.id));
        assert!(config_rows.iter().all(|item| item.source == "mock"));
    }

    #[test]
    fn second_identical_capture_records_no_timeline_events() {
        let mut conn = memory_db();
        let software = MockSoftwareCollector::new();
        let config = MockConfigCollector::new();

        // First capture has no prior snapshot, so it produces no events.
        capture_with_collectors(&mut conn, &software, &config).expect("first capture");
        assert!(timeline_repo::list_events(&conn)
            .expect("list after first")
            .is_empty());

        // Second capture with identical mock collectors: no changes, no events.
        capture_with_collectors(&mut conn, &software, &config).expect("second capture");
        assert!(timeline_repo::list_events(&conn)
            .expect("list after second")
            .is_empty());
    }
}
