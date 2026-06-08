//! Repository functions for health samples.
//!
//! All SQLite access for the Health Intelligence slice lives here. Writes are
//! single-row inserts on `&Connection`; reads return a newest-first list or the
//! single most-recent row.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::CoreError;
use crate::models::HealthSample;

/// Inserts a single health sample row.
pub fn insert_sample(conn: &Connection, sample: &HealthSample) -> Result<(), CoreError> {
    conn.execute(
        "INSERT INTO health_samples
            (id, device_id, captured_at, cpu_usage, memory_total, memory_used,
             disk_total, disk_used, health_score)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            sample.id,
            sample.device_id,
            sample.captured_at,
            sample.cpu_usage,
            sample.memory_total,
            sample.memory_used,
            sample.disk_total,
            sample.disk_used,
            sample.health_score,
        ],
    )?;
    Ok(())
}

/// Lists all health samples, newest first (`captured_at DESC`).
pub fn list_samples(conn: &Connection) -> Result<Vec<HealthSample>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, device_id, captured_at, cpu_usage, memory_total, memory_used,
                disk_total, disk_used, health_score
         FROM health_samples
         ORDER BY captured_at DESC",
    )?;
    let rows = stmt.query_map([], row_to_sample)?;
    let mut samples = Vec::new();
    for row in rows {
        samples.push(row?);
    }
    Ok(samples)
}

/// Fetches the most recent health sample, or `None` if none have been recorded.
pub fn latest_sample(conn: &Connection) -> Result<Option<HealthSample>, CoreError> {
    let sample = conn
        .query_row(
            "SELECT id, device_id, captured_at, cpu_usage, memory_total, memory_used,
                    disk_total, disk_used, health_score
             FROM health_samples
             ORDER BY captured_at DESC
             LIMIT 1",
            [],
            row_to_sample,
        )
        .optional()?;
    Ok(sample)
}

/// Maps a `health_samples` row to a [`HealthSample`].
fn row_to_sample(row: &rusqlite::Row<'_>) -> rusqlite::Result<HealthSample> {
    Ok(HealthSample {
        id: row.get(0)?,
        device_id: row.get(1)?,
        captured_at: row.get(2)?,
        cpu_usage: row.get(3)?,
        memory_total: row.get(4)?,
        memory_used: row.get(5)?,
        disk_total: row.get(6)?,
        disk_used: row.get(7)?,
        health_score: row.get(8)?,
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

    fn make_sample(id: &str, device_id: &str, captured_at: &str, score: i64) -> HealthSample {
        HealthSample {
            id: id.to_string(),
            device_id: device_id.to_string(),
            captured_at: captured_at.to_string(),
            cpu_usage: 12.5,
            memory_total: 100,
            memory_used: 40,
            disk_total: 200,
            disk_used: 50,
            health_score: score,
        }
    }

    #[test]
    fn insert_list_and_latest_round_trip() {
        let conn = memory_db();
        let device = device_repo::ensure_local_device(&conn).expect("ensure device");

        let s1 = make_sample("s1", &device.id, "2026-06-08T10:00:00Z", 80);
        let s2 = make_sample("s2", &device.id, "2026-06-08T11:00:00Z", 70);
        insert_sample(&conn, &s1).expect("insert s1");
        insert_sample(&conn, &s2).expect("insert s2");

        let all = list_samples(&conn).expect("list samples");
        assert_eq!(all.len(), 2);
        // Newest first (captured_at DESC).
        assert_eq!(all[0].id, "s2");
        assert_eq!(all[1].id, "s1");
        assert_eq!(all[0].memory_used, 40);

        let latest = latest_sample(&conn)
            .expect("latest sample")
            .expect("a row exists");
        assert_eq!(latest.id, "s2");
        assert_eq!(latest.health_score, 70);
    }

    #[test]
    fn latest_sample_is_none_when_empty() {
        let conn = memory_db();
        assert!(latest_sample(&conn).expect("latest sample").is_none());
    }
}
