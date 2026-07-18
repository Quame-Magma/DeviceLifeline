//! Repository functions for [`BackgroundJob`] persistence.
//!
//! All SQLite access for Vision 2.0 background jobs lives here.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::CoreError;
use crate::models::BackgroundJob;

/// Inserts a single background job row.
pub fn insert_job(conn: &Connection, job: &BackgroundJob) -> Result<(), CoreError> {
    conn.execute(
        "INSERT INTO background_jobs
            (id, device_id, job_type, status, progress_pct, message, result_json,
             created_at, updated_at, finished_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            job.id,
            job.device_id,
            job.job_type,
            job.status,
            job.progress_pct,
            job.message,
            job.result_json,
            job.created_at,
            job.updated_at,
            job.finished_at,
        ],
    )?;
    Ok(())
}

/// Updates progress / status fields for a running job.
pub fn update_job(
    conn: &Connection,
    id: &str,
    status: &str,
    progress_pct: i64,
    message: Option<&str>,
    result_json: Option<&str>,
    updated_at: &str,
    finished_at: Option<&str>,
) -> Result<usize, CoreError> {
    let updated = conn.execute(
        "UPDATE background_jobs
         SET status = ?1, progress_pct = ?2, message = ?3, result_json = ?4,
             updated_at = ?5, finished_at = ?6
         WHERE id = ?7",
        params![
            status,
            progress_pct,
            message,
            result_json,
            updated_at,
            finished_at,
            id
        ],
    )?;
    Ok(updated)
}

/// Fetches a single job by id.
pub fn get_job(conn: &Connection, id: &str) -> Result<Option<BackgroundJob>, CoreError> {
    let job = conn
        .query_row(
            "SELECT id, device_id, job_type, status, progress_pct, message, result_json,
                    created_at, updated_at, finished_at
             FROM background_jobs
             WHERE id = ?1",
            params![id],
            row_to_job,
        )
        .optional()?;
    Ok(job)
}

/// Lists background jobs newest first.
pub fn list_jobs(conn: &Connection) -> Result<Vec<BackgroundJob>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, device_id, job_type, status, progress_pct, message, result_json,
                created_at, updated_at, finished_at
         FROM background_jobs
         ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], row_to_job)?;
    let mut jobs = Vec::new();
    for row in rows {
        jobs.push(row?);
    }
    Ok(jobs)
}

/// Maps a `background_jobs` row to a [`BackgroundJob`].
fn row_to_job(row: &rusqlite::Row<'_>) -> rusqlite::Result<BackgroundJob> {
    Ok(BackgroundJob {
        id: row.get(0)?,
        device_id: row.get(1)?,
        job_type: row.get(2)?,
        status: row.get(3)?,
        progress_pct: row.get(4)?,
        message: row.get(5)?,
        result_json: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        finished_at: row.get(9)?,
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
    fn insert_update_list_round_trip() {
        let conn = memory_db();
        let device = device_repo::ensure_local_device(&conn).expect("ensure device");

        let job = BackgroundJob {
            id: "j1".to_string(),
            device_id: device.id,
            job_type: "storage_scan".to_string(),
            status: "running".to_string(),
            progress_pct: 10,
            message: Some("scanning".to_string()),
            result_json: None,
            created_at: "2026-07-16T10:00:00Z".to_string(),
            updated_at: "2026-07-16T10:00:00Z".to_string(),
            finished_at: None,
        };
        insert_job(&conn, &job).expect("insert");

        update_job(
            &conn,
            "j1",
            "completed",
            100,
            Some("done"),
            Some(r#"{"items":5}"#),
            "2026-07-16T10:05:00Z",
            Some("2026-07-16T10:05:00Z"),
        )
        .expect("update");

        let got = get_job(&conn, "j1").expect("get").expect("exists");
        assert_eq!(got.status, "completed");
        assert_eq!(got.progress_pct, 100);
        assert_eq!(list_jobs(&conn).expect("list").len(), 1);
    }
}
