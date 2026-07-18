//! Repository functions for storage scans and items.
//!
//! All SQLite access for the Storage Intelligence engine lives here.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::CoreError;
use crate::models::{StorageItem, StorageScan};

/// Inserts a storage scan row.
pub fn insert_scan(conn: &Connection, scan: &StorageScan) -> Result<(), CoreError> {
    conn.execute(
        "INSERT INTO storage_scans
            (id, device_id, root_path, status, total_bytes, file_count, dir_count,
             created_at, finished_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            scan.id,
            scan.device_id,
            scan.root_path,
            scan.status,
            scan.total_bytes,
            scan.file_count,
            scan.dir_count,
            scan.created_at,
            scan.finished_at,
        ],
    )?;
    Ok(())
}

/// Updates a scan's completion fields.
pub fn update_scan(conn: &Connection, scan: &StorageScan) -> Result<usize, CoreError> {
    let updated = conn.execute(
        "UPDATE storage_scans
         SET status = ?1, total_bytes = ?2, file_count = ?3, dir_count = ?4, finished_at = ?5
         WHERE id = ?6",
        params![
            scan.status,
            scan.total_bytes,
            scan.file_count,
            scan.dir_count,
            scan.finished_at,
            scan.id,
        ],
    )?;
    Ok(updated)
}

/// Inserts a batch of storage items for a scan.
pub fn insert_items(conn: &Connection, items: &[StorageItem]) -> Result<(), CoreError> {
    for item in items {
        conn.execute(
            "INSERT INTO storage_items
                (id, scan_id, path, name, kind, size_bytes, category, is_directory)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                item.id,
                item.scan_id,
                item.path,
                item.name,
                item.kind,
                item.size_bytes,
                item.category,
                item.is_directory as i64,
            ],
        )?;
    }
    Ok(())
}

/// Returns the most recent storage scan, or `None`.
pub fn latest_scan(conn: &Connection) -> Result<Option<StorageScan>, CoreError> {
    let scan = conn
        .query_row(
            "SELECT id, device_id, root_path, status, total_bytes, file_count, dir_count,
                    created_at, finished_at
             FROM storage_scans
             ORDER BY created_at DESC
             LIMIT 1",
            [],
            row_to_scan,
        )
        .optional()?;
    Ok(scan)
}

/// Lists storage items for a scan, largest first.
pub fn list_items(conn: &Connection, scan_id: &str) -> Result<Vec<StorageItem>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, scan_id, path, name, kind, size_bytes, category, is_directory
         FROM storage_items
         WHERE scan_id = ?1
         ORDER BY size_bytes DESC",
    )?;
    let rows = stmt.query_map(params![scan_id], row_to_item)?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }
    Ok(items)
}

/// Maps a `storage_scans` row to a [`StorageScan`].
fn row_to_scan(row: &rusqlite::Row<'_>) -> rusqlite::Result<StorageScan> {
    Ok(StorageScan {
        id: row.get(0)?,
        device_id: row.get(1)?,
        root_path: row.get(2)?,
        status: row.get(3)?,
        total_bytes: row.get(4)?,
        file_count: row.get(5)?,
        dir_count: row.get(6)?,
        created_at: row.get(7)?,
        finished_at: row.get(8)?,
    })
}

/// Maps a `storage_items` row to a [`StorageItem`].
fn row_to_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<StorageItem> {
    let is_dir_i: i64 = row.get(7)?;
    Ok(StorageItem {
        id: row.get(0)?,
        scan_id: row.get(1)?,
        path: row.get(2)?,
        name: row.get(3)?,
        kind: row.get(4)?,
        size_bytes: row.get(5)?,
        category: row.get(6)?,
        is_directory: is_dir_i != 0,
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
    fn scan_and_items_round_trip() {
        let conn = memory_db();
        let device = device_repo::ensure_local_device(&conn).expect("ensure device");

        let scan = StorageScan {
            id: "scan1".to_string(),
            device_id: device.id,
            root_path: "C:\\Temp".to_string(),
            status: "completed".to_string(),
            total_bytes: 1024,
            file_count: 1,
            dir_count: 0,
            created_at: "2026-07-16T10:00:00Z".to_string(),
            finished_at: Some("2026-07-16T10:00:01Z".to_string()),
        };
        insert_scan(&conn, &scan).expect("insert scan");

        let item = StorageItem {
            id: "item1".to_string(),
            scan_id: "scan1".to_string(),
            path: "C:\\Temp\\big.bin".to_string(),
            name: "big.bin".to_string(),
            kind: "file".to_string(),
            size_bytes: 1024,
            category: "other".to_string(),
            is_directory: false,
        };
        insert_items(&conn, &[item]).expect("insert items");

        let latest = latest_scan(&conn).expect("latest").expect("exists");
        assert_eq!(latest.id, "scan1");
        let items = list_items(&conn, "scan1").expect("items");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].name, "big.bin");
    }
}
