//! Repository functions for [`Device`], [`DeviceDnaSnapshot`], and
//! [`SoftwareInventoryItem`].
//!
//! All SQLite access for the Device DNA slice lives here. Functions accept a
//! `&mut rusqlite::Connection` where a transaction is required and `&Connection`
//! for read-only queries.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::CoreError;
use crate::models::{Device, DeviceDnaSnapshot, SoftwareInventoryItem};

/// Returns the single local [`Device`], inserting it on first use.
///
/// The local device is identified by `os_name = std::env::consts::OS` plus the
/// machine hostname (from `COMPUTERNAME` on Windows or `HOSTNAME` elsewhere,
/// falling back to `"unknown"`). `os_version` is empty in this increment.
pub fn ensure_local_device(conn: &Connection) -> Result<Device, CoreError> {
    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown".to_string());
    let os_name = std::env::consts::OS.to_string();

    if let Some(device) = find_local_device(conn, &hostname, &os_name)? {
        return Ok(device);
    }

    let created_at = time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .map_err(|err| CoreError::Internal(format!("timestamp formatting failed: {err}")))?;

    let device = Device {
        id: uuid::Uuid::new_v4().to_string(),
        hostname,
        os_name,
        os_version: String::new(),
        created_at,
    };

    conn.execute(
        "INSERT INTO devices (id, hostname, os_name, os_version, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            device.id,
            device.hostname,
            device.os_name,
            device.os_version,
            device.created_at,
        ],
    )?;

    Ok(device)
}

/// Looks up an existing local device by hostname + OS name.
fn find_local_device(
    conn: &Connection,
    hostname: &str,
    os_name: &str,
) -> Result<Option<Device>, CoreError> {
    let device = conn
        .query_row(
            "SELECT id, hostname, os_name, os_version, created_at
             FROM devices
             WHERE hostname = ?1 AND os_name = ?2
             LIMIT 1",
            params![hostname, os_name],
            row_to_device,
        )
        .optional()?;
    Ok(device)
}

/// Inserts a snapshot and all of its software items inside a single
/// transaction. Either everything commits or nothing does.
pub fn insert_snapshot(
    conn: &mut Connection,
    snapshot: &DeviceDnaSnapshot,
    items: &[SoftwareInventoryItem],
) -> Result<(), CoreError> {
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO device_dna_snapshots
            (id, device_id, captured_at, schema_version, source, software_count)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            snapshot.id,
            snapshot.device_id,
            snapshot.captured_at,
            snapshot.schema_version,
            snapshot.source,
            snapshot.software_count,
        ],
    )?;

    for item in items {
        tx.execute(
            "INSERT INTO software_inventory_items
                (id, snapshot_id, name, version, publisher, install_date, source, install_location)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                item.id,
                item.snapshot_id,
                item.name,
                item.version,
                item.publisher,
                item.install_date,
                item.source,
                item.install_location,
            ],
        )?;
    }

    tx.commit()?;
    Ok(())
}

/// Lists all snapshots, newest first (`captured_at DESC`).
pub fn list_snapshots(conn: &Connection) -> Result<Vec<DeviceDnaSnapshot>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, device_id, captured_at, schema_version, source, software_count
         FROM device_dna_snapshots
         ORDER BY captured_at DESC",
    )?;
    let rows = stmt.query_map([], row_to_snapshot)?;
    let mut snapshots = Vec::new();
    for row in rows {
        snapshots.push(row?);
    }
    Ok(snapshots)
}

/// Fetches a single snapshot by id, or `None` if it does not exist.
pub fn get_snapshot(conn: &Connection, id: &str) -> Result<Option<DeviceDnaSnapshot>, CoreError> {
    let snapshot = conn
        .query_row(
            "SELECT id, device_id, captured_at, schema_version, source, software_count
             FROM device_dna_snapshots
             WHERE id = ?1",
            params![id],
            row_to_snapshot,
        )
        .optional()?;
    Ok(snapshot)
}

/// Lists the software inventory items for a snapshot, ordered by name.
pub fn list_software(
    conn: &Connection,
    snapshot_id: &str,
) -> Result<Vec<SoftwareInventoryItem>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, snapshot_id, name, version, publisher, install_date, source, install_location
         FROM software_inventory_items
         WHERE snapshot_id = ?1
         ORDER BY name",
    )?;
    let rows = stmt.query_map(params![snapshot_id], row_to_software)?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }
    Ok(items)
}

/// Lists all known devices.
pub fn list_devices(conn: &Connection) -> Result<Vec<Device>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, hostname, os_name, os_version, created_at
         FROM devices
         ORDER BY created_at",
    )?;
    let rows = stmt.query_map([], row_to_device)?;
    let mut devices = Vec::new();
    for row in rows {
        devices.push(row?);
    }
    Ok(devices)
}

/// Maps a `devices` row to a [`Device`].
fn row_to_device(row: &rusqlite::Row<'_>) -> rusqlite::Result<Device> {
    Ok(Device {
        id: row.get(0)?,
        hostname: row.get(1)?,
        os_name: row.get(2)?,
        os_version: row.get(3)?,
        created_at: row.get(4)?,
    })
}

/// Maps a `device_dna_snapshots` row to a [`DeviceDnaSnapshot`].
fn row_to_snapshot(row: &rusqlite::Row<'_>) -> rusqlite::Result<DeviceDnaSnapshot> {
    Ok(DeviceDnaSnapshot {
        id: row.get(0)?,
        device_id: row.get(1)?,
        captured_at: row.get(2)?,
        schema_version: row.get(3)?,
        source: row.get(4)?,
        software_count: row.get(5)?,
    })
}

/// Maps a `software_inventory_items` row to a [`SoftwareInventoryItem`].
fn row_to_software(row: &rusqlite::Row<'_>) -> rusqlite::Result<SoftwareInventoryItem> {
    Ok(SoftwareInventoryItem {
        id: row.get(0)?,
        snapshot_id: row.get(1)?,
        name: row.get(2)?,
        version: row.get(3)?,
        publisher: row.get(4)?,
        install_date: row.get(5)?,
        source: row.get(6)?,
        install_location: row.get(7)?,
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
    fn ensure_local_device_is_idempotent() {
        let conn = memory_db();
        let first = ensure_local_device(&conn).expect("first ensure");
        let second = ensure_local_device(&conn).expect("second ensure");
        assert_eq!(first.id, second.id);
        assert_eq!(list_devices(&conn).expect("list").len(), 1);
    }

    #[test]
    fn snapshot_round_trip() {
        let mut conn = memory_db();
        let device = ensure_local_device(&conn).expect("ensure device");

        let snapshot = DeviceDnaSnapshot {
            id: uuid::Uuid::new_v4().to_string(),
            device_id: device.id.clone(),
            captured_at: "2026-06-08T00:00:00Z".to_string(),
            schema_version: 1,
            source: "manual".to_string(),
            software_count: 2,
        };
        let items = vec![
            SoftwareInventoryItem {
                id: uuid::Uuid::new_v4().to_string(),
                snapshot_id: snapshot.id.clone(),
                name: "Zeta App".to_string(),
                version: Some("1.0".to_string()),
                publisher: None,
                install_date: None,
                source: "mock".to_string(),
                install_location: None,
            },
            SoftwareInventoryItem {
                id: uuid::Uuid::new_v4().to_string(),
                snapshot_id: snapshot.id.clone(),
                name: "Alpha Tool".to_string(),
                version: None,
                publisher: Some("Acme".to_string()),
                install_date: None,
                source: "mock".to_string(),
                install_location: None,
            },
        ];

        insert_snapshot(&mut conn, &snapshot, &items).expect("insert snapshot");

        let snapshots = list_snapshots(&conn).expect("list snapshots");
        assert_eq!(snapshots.len(), 1);
        assert_eq!(snapshots[0].id, snapshot.id);

        let fetched = get_snapshot(&conn, &snapshot.id).expect("get snapshot");
        assert!(fetched.is_some());
        assert!(get_snapshot(&conn, "missing")
            .expect("get missing")
            .is_none());

        let software = list_software(&conn, &snapshot.id).expect("list software");
        assert_eq!(software.len(), 2);
        // Ordered by name: "Alpha Tool" precedes "Zeta App".
        assert_eq!(software[0].name, "Alpha Tool");
        assert_eq!(software[1].name, "Zeta App");
    }
}
