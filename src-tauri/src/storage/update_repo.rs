//! Persistence for Patch My PC–class software updates.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::CoreError;
use crate::models::SoftwareUpdate;

pub fn replace_updates(
    conn: &Connection,
    device_id: &str,
    updates: &[SoftwareUpdate],
) -> Result<(), CoreError> {
    conn.execute(
        "DELETE FROM software_updates WHERE device_id = ?1",
        params![device_id],
    )
    .map_err(|e| CoreError::Internal(e.to_string()))?;

    for u in updates {
        conn.execute(
            "INSERT INTO software_updates (
                id, device_id, name, winget_id, publisher, current_version,
                available_version, source, status, detail, scanned_at
            ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                u.id,
                u.device_id,
                u.name,
                u.winget_id,
                u.publisher,
                u.current_version,
                u.available_version,
                u.source,
                u.status,
                u.detail,
                u.scanned_at,
            ],
        )
        .map_err(|e| CoreError::Internal(e.to_string()))?;
    }
    Ok(())
}

pub fn list_updates(conn: &Connection, device_id: &str) -> Result<Vec<SoftwareUpdate>, CoreError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, device_id, name, winget_id, publisher, current_version,
                    available_version, source, status, detail, scanned_at
             FROM software_updates
             WHERE device_id = ?1
             ORDER BY name COLLATE NOCASE",
        )
        .map_err(|e| CoreError::Internal(e.to_string()))?;

    let rows = stmt
        .query_map(params![device_id], |row| {
            Ok(SoftwareUpdate {
                id: row.get(0)?,
                device_id: row.get(1)?,
                name: row.get(2)?,
                winget_id: row.get(3)?,
                publisher: row.get(4)?,
                current_version: row.get(5)?,
                available_version: row.get(6)?,
                source: row.get(7)?,
                status: row.get(8)?,
                detail: row.get(9)?,
                scanned_at: row.get(10)?,
            })
        })
        .map_err(|e| CoreError::Internal(e.to_string()))?;

    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| CoreError::Internal(e.to_string()))?);
    }
    Ok(out)
}

pub fn get_update(conn: &Connection, id: &str) -> Result<Option<SoftwareUpdate>, CoreError> {
    conn.query_row(
        "SELECT id, device_id, name, winget_id, publisher, current_version,
                available_version, source, status, detail, scanned_at
         FROM software_updates WHERE id = ?1",
        params![id],
        |row| {
            Ok(SoftwareUpdate {
                id: row.get(0)?,
                device_id: row.get(1)?,
                name: row.get(2)?,
                winget_id: row.get(3)?,
                publisher: row.get(4)?,
                current_version: row.get(5)?,
                available_version: row.get(6)?,
                source: row.get(7)?,
                status: row.get(8)?,
                detail: row.get(9)?,
                scanned_at: row.get(10)?,
            })
        },
    )
    .optional()
    .map_err(|e| CoreError::Internal(e.to_string()))
}

pub fn set_status(
    conn: &Connection,
    id: &str,
    status: &str,
    detail: Option<&str>,
) -> Result<(), CoreError> {
    conn.execute(
        "UPDATE software_updates SET status = ?1, detail = ?2 WHERE id = ?3",
        params![status, detail, id],
    )
    .map_err(|e| CoreError::Internal(e.to_string()))?;
    Ok(())
}
