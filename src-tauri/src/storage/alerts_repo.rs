//! Repository functions for [`HealthAlert`] persistence.
//!
//! All SQLite access for the Health Alerts slice lives here. Writes are
//! single-row `execute`s on `&Connection`; reads return alerts unacknowledged
//! first, then newest.

use rusqlite::{params, Connection};

use crate::error::CoreError;
use crate::models::HealthAlert;

/// Inserts a batch of alerts. Called while persisting a freshly captured health
/// sample, so the count is small and a per-row insert is sufficient.
pub fn insert_alerts(conn: &Connection, alerts: &[HealthAlert]) -> Result<(), CoreError> {
    for alert in alerts {
        conn.execute(
            "INSERT INTO health_alerts
                (id, device_id, sample_id, created_at, kind, severity, title,
                 detail, value, acknowledged)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                alert.id,
                alert.device_id,
                alert.sample_id,
                alert.created_at,
                alert.kind,
                alert.severity,
                alert.title,
                alert.detail,
                alert.value,
                alert.acknowledged,
            ],
        )?;
    }
    Ok(())
}

/// Lists alerts, unacknowledged first, then newest by `created_at`.
pub fn list_alerts(conn: &Connection) -> Result<Vec<HealthAlert>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, device_id, sample_id, created_at, kind, severity, title,
                detail, value, acknowledged
         FROM health_alerts
         ORDER BY acknowledged ASC, created_at DESC",
    )?;
    let rows = stmt.query_map([], row_to_alert)?;
    let mut alerts = Vec::new();
    for row in rows {
        alerts.push(row?);
    }
    Ok(alerts)
}

/// Marks an alert acknowledged. Returns the number of rows updated (`0` if the
/// id was not found).
pub fn acknowledge(conn: &Connection, id: &str) -> Result<usize, CoreError> {
    let updated = conn.execute(
        "UPDATE health_alerts SET acknowledged = 1 WHERE id = ?1",
        params![id],
    )?;
    Ok(updated)
}

/// Maps a `health_alerts` row to a [`HealthAlert`].
fn row_to_alert(row: &rusqlite::Row<'_>) -> rusqlite::Result<HealthAlert> {
    Ok(HealthAlert {
        id: row.get(0)?,
        device_id: row.get(1)?,
        sample_id: row.get(2)?,
        created_at: row.get(3)?,
        kind: row.get(4)?,
        severity: row.get(5)?,
        title: row.get(6)?,
        detail: row.get(7)?,
        value: row.get(8)?,
        acknowledged: row.get(9)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::HealthSample;
    use crate::storage::{db, device_repo, health_repo};

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("enable foreign keys");
        db::run_migrations(&conn).expect("run migrations");
        conn
    }

    fn seed_sample(conn: &Connection, device_id: &str) -> HealthSample {
        let sample = HealthSample {
            id: "sample-1".to_string(),
            device_id: device_id.to_string(),
            captured_at: "2026-06-08T10:00:00Z".to_string(),
            cpu_usage: 96.0,
            memory_total: 100,
            memory_used: 95,
            disk_total: 100,
            disk_used: 95,
            disk_name: Some("C:\\".to_string()),
            disk_count: 1,
            health_score: 10,
        };
        health_repo::insert_sample(conn, &sample).expect("insert sample");
        sample
    }

    fn alert(id: &str, sample: &HealthSample, kind: &str, acknowledged: bool) -> HealthAlert {
        HealthAlert {
            id: id.to_string(),
            device_id: sample.device_id.clone(),
            sample_id: sample.id.clone(),
            created_at: sample.captured_at.clone(),
            kind: kind.to_string(),
            severity: "critical".to_string(),
            title: "t".to_string(),
            detail: "d".to_string(),
            value: 95.0,
            acknowledged,
        }
    }

    #[test]
    fn insert_list_and_acknowledge() {
        let conn = memory_db();
        let device = device_repo::ensure_local_device(&conn).expect("ensure device");
        let sample = seed_sample(&conn, &device.id);

        insert_alerts(
            &conn,
            &[
                alert("a1", &sample, "memory_critical", true),
                alert("a2", &sample, "disk_low_space", false),
            ],
        )
        .expect("insert alerts");

        let listed = list_alerts(&conn).expect("list alerts");
        assert_eq!(listed.len(), 2);
        // Unacknowledged sorts first.
        assert_eq!(listed[0].id, "a2");
        assert!(!listed[0].acknowledged);
        assert!(listed[1].acknowledged);

        let updated = acknowledge(&conn, "a2").expect("acknowledge");
        assert_eq!(updated, 1);

        let after = list_alerts(&conn).expect("list after ack");
        assert!(after.iter().all(|a| a.acknowledged));
    }

    #[test]
    fn acknowledge_unknown_id_updates_nothing() {
        let conn = memory_db();
        assert_eq!(acknowledge(&conn, "missing").expect("acknowledge"), 0);
    }
}
