//! Persistence for driver inventory.

use rusqlite::{params, Connection};

use crate::error::CoreError;
use crate::models::DriverInfo;

pub fn replace_drivers(
    conn: &Connection,
    device_id: &str,
    drivers: &[DriverInfo],
) -> Result<(), CoreError> {
    conn.execute(
        "DELETE FROM drivers WHERE device_id = ?1",
        params![device_id],
    )?;
    for d in drivers {
        let reasons = serde_json::to_string(&d.risk_reasons).unwrap_or_else(|_| "[]".into());
        conn.execute(
            "INSERT INTO drivers
             (id, device_id, captured_at, name, device_class, manufacturer, driver_version,
              driver_date, signer, is_signed, inf_name, hardware_id, status, health_score, risk_reasons)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
            params![
                d.id,
                d.device_id,
                d.captured_at,
                d.name,
                d.device_class,
                d.manufacturer,
                d.driver_version,
                d.driver_date,
                d.signer,
                d.is_signed as i64,
                d.inf_name,
                d.hardware_id,
                d.status,
                d.health_score,
                reasons,
            ],
        )?;
    }
    Ok(())
}

pub fn list_drivers(conn: &Connection) -> Result<Vec<DriverInfo>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, device_id, captured_at, name, device_class, manufacturer, driver_version,
                driver_date, signer, is_signed, inf_name, hardware_id, status, health_score, risk_reasons
         FROM drivers ORDER BY health_score ASC, name ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        let reasons_json: String = row.get(14)?;
        let risk_reasons: Vec<String> = serde_json::from_str(&reasons_json).unwrap_or_default();
        let signed: i64 = row.get(9)?;
        Ok(DriverInfo {
            id: row.get(0)?,
            device_id: row.get(1)?,
            captured_at: row.get(2)?,
            name: row.get(3)?,
            device_class: row.get(4)?,
            manufacturer: row.get(5)?,
            driver_version: row.get(6)?,
            driver_date: row.get(7)?,
            signer: row.get(8)?,
            is_signed: signed != 0,
            inf_name: row.get(10)?,
            hardware_id: row.get(11)?,
            status: row.get(12)?,
            health_score: row.get(13)?,
            risk_reasons,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(CoreError::from)
}
