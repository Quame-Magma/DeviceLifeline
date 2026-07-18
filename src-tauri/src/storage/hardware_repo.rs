//! Persistence for hardware samples and SMART readings.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::CoreError;
use crate::models::{HardwareSample, SensorReading, SmartReading};

fn hydrate_sensors(metrics_json: &str) -> Vec<SensorReading> {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(metrics_json) else {
        return Vec::new();
    };
    v.get("sensors")
        .and_then(|s| serde_json::from_value(s.clone()).ok())
        .unwrap_or_default()
}

pub fn insert_sample(conn: &Connection, sample: &HardwareSample) -> Result<(), CoreError> {
    conn.execute(
        "INSERT INTO hardware_samples
         (id, device_id, captured_at, cpu_temp_c, gpu_temp_c, gpu_name, gpu_usage_pct,
          gpu_vram_used, gpu_vram_total, cpu_clock_mhz, metrics_json)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![
            sample.id,
            sample.device_id,
            sample.captured_at,
            sample.cpu_temp_c,
            sample.gpu_temp_c,
            sample.gpu_name,
            sample.gpu_usage_pct,
            sample.gpu_vram_used,
            sample.gpu_vram_total,
            sample.cpu_clock_mhz,
            sample.metrics_json,
        ],
    )?;
    for reading in &sample.smart {
        conn.execute(
            "INSERT INTO smart_readings
             (id, sample_id, disk_name, model, serial, media_type, health_status,
              temperature_c, power_on_hours, wear_pct, raw_json)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                reading.id,
                reading.sample_id,
                reading.disk_name,
                reading.model,
                reading.serial,
                reading.media_type,
                reading.health_status,
                reading.temperature_c,
                reading.power_on_hours,
                reading.wear_pct,
                reading.raw_json,
            ],
        )?;
    }
    Ok(())
}

pub fn latest_sample(conn: &Connection) -> Result<Option<HardwareSample>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, device_id, captured_at, cpu_temp_c, gpu_temp_c, gpu_name, gpu_usage_pct,
                gpu_vram_used, gpu_vram_total, cpu_clock_mhz, metrics_json
         FROM hardware_samples ORDER BY captured_at DESC LIMIT 1",
    )?;
    let row = stmt
        .query_row([], |row| {
            Ok({
                let metrics_json: String = row.get(10)?;
                HardwareSample {
                    id: row.get(0)?,
                    device_id: row.get(1)?,
                    captured_at: row.get(2)?,
                    cpu_temp_c: row.get(3)?,
                    gpu_temp_c: row.get(4)?,
                    gpu_name: row.get(5)?,
                    gpu_usage_pct: row.get(6)?,
                    gpu_vram_used: row.get(7)?,
                    gpu_vram_total: row.get(8)?,
                    cpu_clock_mhz: row.get(9)?,
                    sensors: hydrate_sensors(&metrics_json),
                    metrics_json,
                    smart: Vec::new(),
                }
            })
        })
        .optional()?;
    if let Some(mut sample) = row {
        sample.smart = list_smart(conn, &sample.id)?;
        Ok(Some(sample))
    } else {
        Ok(None)
    }
}

pub fn list_samples(conn: &Connection, limit: i64) -> Result<Vec<HardwareSample>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, device_id, captured_at, cpu_temp_c, gpu_temp_c, gpu_name, gpu_usage_pct,
                gpu_vram_used, gpu_vram_total, cpu_clock_mhz, metrics_json
         FROM hardware_samples ORDER BY captured_at DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit], |row| {
        let metrics_json: String = row.get(10)?;
        Ok(HardwareSample {
            id: row.get(0)?,
            device_id: row.get(1)?,
            captured_at: row.get(2)?,
            cpu_temp_c: row.get(3)?,
            gpu_temp_c: row.get(4)?,
            gpu_name: row.get(5)?,
            gpu_usage_pct: row.get(6)?,
            gpu_vram_used: row.get(7)?,
            gpu_vram_total: row.get(8)?,
            cpu_clock_mhz: row.get(9)?,
            sensors: hydrate_sensors(&metrics_json),
            metrics_json,
            smart: Vec::new(),
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        let mut s = r?;
        s.smart = list_smart(conn, &s.id)?;
        out.push(s);
    }
    Ok(out)
}

fn list_smart(conn: &Connection, sample_id: &str) -> Result<Vec<SmartReading>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, sample_id, disk_name, model, serial, media_type, health_status,
                temperature_c, power_on_hours, wear_pct, raw_json
         FROM smart_readings WHERE sample_id = ?1 ORDER BY disk_name",
    )?;
    let rows = stmt.query_map(params![sample_id], |row| {
        Ok(SmartReading {
            id: row.get(0)?,
            sample_id: row.get(1)?,
            disk_name: row.get(2)?,
            model: row.get(3)?,
            serial: row.get(4)?,
            media_type: row.get(5)?,
            health_status: row.get(6)?,
            temperature_c: row.get(7)?,
            power_on_hours: row.get(8)?,
            wear_pct: row.get(9)?,
            raw_json: row.get(10)?,
            size_bytes: None,
            attributes: Vec::new(),
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(CoreError::from)
}
