//! Persistence for recovery vault entries.

use rusqlite::{params, Connection};

use crate::error::CoreError;
use crate::models::VaultEntry;

pub fn insert(conn: &Connection, entry: &VaultEntry) -> Result<(), CoreError> {
    conn.execute(
        "INSERT INTO vault_entries
         (id, device_id, kind, title, status, detail, path, size_bytes, created_at, metadata_json)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![
            entry.id,
            entry.device_id,
            entry.kind,
            entry.title,
            entry.status,
            entry.detail,
            entry.path,
            entry.size_bytes,
            entry.created_at,
            entry.metadata_json,
        ],
    )?;
    Ok(())
}

pub fn list(conn: &Connection) -> Result<Vec<VaultEntry>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, device_id, kind, title, status, detail, path, size_bytes, created_at, metadata_json
         FROM vault_entries ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(VaultEntry {
            id: row.get(0)?,
            device_id: row.get(1)?,
            kind: row.get(2)?,
            title: row.get(3)?,
            status: row.get(4)?,
            detail: row.get(5)?,
            path: row.get(6)?,
            size_bytes: row.get(7)?,
            created_at: row.get(8)?,
            metadata_json: row.get(9)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(CoreError::from)
}
