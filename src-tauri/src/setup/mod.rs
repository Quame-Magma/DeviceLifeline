//! Setup Export / Import.
//!
//! Exports a Device DNA snapshot (plus its software inventory and system
//! configuration) to a portable, checksummed [`SetupBundle`], and imports such
//! a bundle back as a new local snapshot — the basis for recreating a setup on
//! another machine. Persistence is delegated to `storage`; the only logic here
//! is bundle assembly and SHA-256 integrity verification.

use rusqlite::Connection;
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::{ConfigItem, DeviceDnaSnapshot, SetupBundle, SoftwareInventoryItem};
use crate::storage::device_repo;

/// Current bundle format version.
const BUNDLE_FORMAT_VERSION: i64 = 1;
/// Snapshot `source` stamped on an imported snapshot.
const IMPORT_SOURCE: &str = "import";

/// The checksummed payload of a [`SetupBundle`] — the parts whose integrity is
/// verified (everything except the envelope metadata and the checksum itself).
#[derive(Serialize)]
struct BundlePayload<'a> {
    snapshot: &'a DeviceDnaSnapshot,
    software: &'a [SoftwareInventoryItem],
    config: &'a [ConfigItem],
}

/// Computes the SHA-256 (lowercase hex) of the serialized payload.
fn payload_checksum(
    snapshot: &DeviceDnaSnapshot,
    software: &[SoftwareInventoryItem],
    config: &[ConfigItem],
) -> Result<String, CoreError> {
    let payload = BundlePayload {
        snapshot,
        software,
        config,
    };
    let json = serde_json::to_string(&payload)
        .map_err(|err| CoreError::Internal(format!("bundle serialization failed: {err}")))?;
    let mut hasher = Sha256::new();
    hasher.update(json.as_bytes());
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

/// Builds a portable [`SetupBundle`] from a stored snapshot.
pub fn build_bundle(conn: &Connection, snapshot_id: &str) -> Result<SetupBundle, CoreError> {
    let snapshot = device_repo::get_snapshot(conn, snapshot_id)?
        .ok_or_else(|| CoreError::NotFound(format!("snapshot {snapshot_id}")))?;
    let software = device_repo::list_software(conn, snapshot_id)?;
    let config = device_repo::list_config(conn, snapshot_id)?;
    let checksum = payload_checksum(&snapshot, &software, &config)?;
    let source_hostname = device_repo::ensure_local_device(conn)?.hostname;

    Ok(SetupBundle {
        format_version: BUNDLE_FORMAT_VERSION,
        exported_at: now_rfc3339()?,
        source_hostname,
        snapshot,
        software,
        config,
        checksum,
    })
}

/// Imports a [`SetupBundle`] (parsed from `json`) as a new local snapshot after
/// verifying its checksum. New ids are assigned and the snapshot is stamped with
/// the local device and an `"import"` source. Returns the created snapshot.
pub fn import_bundle(conn: &mut Connection, json: &str) -> Result<DeviceDnaSnapshot, CoreError> {
    let bundle: SetupBundle = serde_json::from_str(json)
        .map_err(|err| CoreError::Internal(format!("invalid setup bundle: {err}")))?;

    let expected = payload_checksum(&bundle.snapshot, &bundle.software, &bundle.config)?;
    if expected != bundle.checksum {
        return Err(CoreError::Internal(
            "setup bundle checksum mismatch (the file may be corrupt)".to_string(),
        ));
    }

    let device = device_repo::ensure_local_device(conn)?;
    let snapshot_id = uuid::Uuid::new_v4().to_string();
    let snapshot = DeviceDnaSnapshot {
        id: snapshot_id.clone(),
        device_id: device.id,
        captured_at: now_rfc3339()?,
        schema_version: bundle.snapshot.schema_version,
        source: IMPORT_SOURCE.to_string(),
        software_count: bundle.software.len() as i64,
        config_count: bundle.config.len() as i64,
    };

    let software: Vec<SoftwareInventoryItem> = bundle
        .software
        .into_iter()
        .map(|item| SoftwareInventoryItem {
            id: uuid::Uuid::new_v4().to_string(),
            snapshot_id: snapshot_id.clone(),
            ..item
        })
        .collect();
    let config: Vec<ConfigItem> = bundle
        .config
        .into_iter()
        .map(|item| ConfigItem {
            id: uuid::Uuid::new_v4().to_string(),
            snapshot_id: snapshot_id.clone(),
            ..item
        })
        .collect();

    device_repo::insert_snapshot(conn, &snapshot, &software, &config)?;
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dna::snapshot::capture_snapshot;
    use crate::storage::{db, device_repo};

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("enable foreign keys");
        db::run_migrations(&conn).expect("run migrations");
        conn
    }

    #[test]
    fn build_then_import_round_trip() {
        let mut conn = memory_db();
        let original = capture_snapshot(&mut conn).expect("capture snapshot");

        let bundle = build_bundle(&conn, &original.id).expect("build bundle");
        assert_eq!(bundle.format_version, 1);
        assert!(!bundle.checksum.is_empty());
        assert_eq!(bundle.software.len() as i64, original.software_count);

        let json = serde_json::to_string(&bundle).expect("serialize bundle");
        let imported = import_bundle(&mut conn, &json).expect("import bundle");

        assert_ne!(imported.id, original.id);
        assert_eq!(imported.source, "import");
        assert_eq!(imported.software_count, original.software_count);
        assert_eq!(imported.config_count, original.config_count);

        // The imported snapshot's items are retrievable under the new id.
        let imported_software =
            device_repo::list_software(&conn, &imported.id).expect("list imported software");
        assert_eq!(imported_software.len() as i64, original.software_count);
        assert!(imported_software
            .iter()
            .all(|s| s.snapshot_id == imported.id));
    }

    #[test]
    fn checksum_mismatch_is_rejected() {
        let mut conn = memory_db();
        let original = capture_snapshot(&mut conn).expect("capture snapshot");
        let mut bundle = build_bundle(&conn, &original.id).expect("build bundle");

        // Tamper with the payload without updating the checksum.
        bundle.software.clear();
        let json = serde_json::to_string(&bundle).expect("serialize bundle");

        let result = import_bundle(&mut conn, &json);
        assert!(result.is_err());
    }

    #[test]
    fn checksum_is_deterministic() {
        let mut conn = memory_db();
        let snapshot = capture_snapshot(&mut conn).expect("capture snapshot");
        let first = build_bundle(&conn, &snapshot.id).expect("first build");
        let second = build_bundle(&conn, &snapshot.id).expect("second build");
        assert_eq!(first.checksum, second.checksum);
    }
}
