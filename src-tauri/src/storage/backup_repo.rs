//! Persistence for Macrium-class VSS shadows and backup schedules.

use rusqlite::{params, Connection};

use crate::error::CoreError;
use crate::models::{BackupSchedule, VolumeShadow};

pub fn insert_shadow(conn: &Connection, shadow: &VolumeShadow) -> Result<(), CoreError> {
    conn.execute(
        "INSERT INTO volume_shadows (
            id, device_id, shadow_id, volume, device_object, created_at, status, detail
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params![
            shadow.id,
            shadow.device_id,
            shadow.shadow_id,
            shadow.volume,
            shadow.device_object,
            shadow.created_at,
            shadow.status,
            shadow.detail,
        ],
    )
    .map_err(|e| CoreError::Internal(e.to_string()))?;
    Ok(())
}

pub fn list_shadows(conn: &Connection, device_id: &str) -> Result<Vec<VolumeShadow>, CoreError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, device_id, shadow_id, volume, device_object, created_at, status, detail
             FROM volume_shadows WHERE device_id = ?1
             ORDER BY created_at DESC",
        )
        .map_err(|e| CoreError::Internal(e.to_string()))?;
    let rows = stmt
        .query_map(params![device_id], |row| {
            Ok(VolumeShadow {
                id: row.get(0)?,
                device_id: row.get(1)?,
                shadow_id: row.get(2)?,
                volume: row.get(3)?,
                device_object: row.get(4)?,
                created_at: row.get(5)?,
                status: row.get(6)?,
                detail: row.get(7)?,
            })
        })
        .map_err(|e| CoreError::Internal(e.to_string()))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| CoreError::Internal(e.to_string()))?);
    }
    Ok(out)
}

pub fn insert_schedule(conn: &Connection, schedule: &BackupSchedule) -> Result<(), CoreError> {
    conn.execute(
        "INSERT INTO backup_schedules (
            id, device_id, volume, frequency, enabled, last_run_at, next_run_at, created_at, detail
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![
            schedule.id,
            schedule.device_id,
            schedule.volume,
            schedule.frequency,
            if schedule.enabled { 1 } else { 0 },
            schedule.last_run_at,
            schedule.next_run_at,
            schedule.created_at,
            schedule.detail,
        ],
    )
    .map_err(|e| CoreError::Internal(e.to_string()))?;
    Ok(())
}

pub fn list_schedules(
    conn: &Connection,
    device_id: &str,
) -> Result<Vec<BackupSchedule>, CoreError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, device_id, volume, frequency, enabled, last_run_at, next_run_at, created_at, detail
             FROM backup_schedules WHERE device_id = ?1
             ORDER BY created_at DESC",
        )
        .map_err(|e| CoreError::Internal(e.to_string()))?;
    let rows = stmt
        .query_map(params![device_id], |row| {
            let enabled_i: i64 = row.get(4)?;
            Ok(BackupSchedule {
                id: row.get(0)?,
                device_id: row.get(1)?,
                volume: row.get(2)?,
                frequency: row.get(3)?,
                enabled: enabled_i != 0,
                last_run_at: row.get(5)?,
                next_run_at: row.get(6)?,
                created_at: row.get(7)?,
                detail: row.get(8)?,
            })
        })
        .map_err(|e| CoreError::Internal(e.to_string()))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| CoreError::Internal(e.to_string()))?);
    }
    Ok(out)
}

pub fn set_schedule_enabled(
    conn: &Connection,
    id: &str,
    enabled: bool,
) -> Result<(), CoreError> {
    conn.execute(
        "UPDATE backup_schedules SET enabled = ?1 WHERE id = ?2",
        params![if enabled { 1 } else { 0 }, id],
    )
    .map_err(|e| CoreError::Internal(e.to_string()))?;
    Ok(())
}

pub fn touch_schedule_run(
    conn: &Connection,
    id: &str,
    last_run: &str,
    next_run: Option<&str>,
) -> Result<(), CoreError> {
    conn.execute(
        "UPDATE backup_schedules SET last_run_at = ?1, next_run_at = ?2 WHERE id = ?3",
        params![last_run, next_run, id],
    )
    .map_err(|e| CoreError::Internal(e.to_string()))?;
    Ok(())
}
