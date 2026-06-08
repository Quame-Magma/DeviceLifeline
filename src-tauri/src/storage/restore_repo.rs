//! Repository functions for restore plans, steps, jobs, and step results.
//!
//! All SQLite access for the Restore & Install slice lives here. [`insert_plan`]
//! takes a `&mut Connection` (one transaction for the plan plus its steps);
//! single-row writes and all reads use `&Connection`.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::CoreError;
use crate::models::{RestoreJob, RestorePlan, RestorePlanStep, RestoreStepResult};

/// Inserts a plan and all of its steps inside a single transaction. Either
/// everything commits or nothing does.
pub fn insert_plan(
    conn: &mut Connection,
    plan: &RestorePlan,
    steps: &[RestorePlanStep],
) -> Result<(), CoreError> {
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO restore_plans
            (id, device_id, snapshot_id, name, created_at, step_count)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            plan.id,
            plan.device_id,
            plan.snapshot_id,
            plan.name,
            plan.created_at,
            plan.step_count,
        ],
    )?;

    for step in steps {
        tx.execute(
            "INSERT INTO restore_plan_steps
                (id, plan_id, order_index, software_name, target_version, winget_id, source)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                step.id,
                step.plan_id,
                step.order_index,
                step.software_name,
                step.target_version,
                step.winget_id,
                step.source,
            ],
        )?;
    }

    tx.commit()?;
    Ok(())
}

/// Lists all restore plans, newest first (`created_at DESC`).
pub fn list_plans(conn: &Connection) -> Result<Vec<RestorePlan>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, device_id, snapshot_id, name, created_at, step_count
         FROM restore_plans
         ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], row_to_plan)?;
    let mut plans = Vec::new();
    for row in rows {
        plans.push(row?);
    }
    Ok(plans)
}

/// Fetches a single restore plan by id, or `None` if it does not exist.
pub fn get_plan(conn: &Connection, id: &str) -> Result<Option<RestorePlan>, CoreError> {
    let plan = conn
        .query_row(
            "SELECT id, device_id, snapshot_id, name, created_at, step_count
             FROM restore_plans
             WHERE id = ?1",
            params![id],
            row_to_plan,
        )
        .optional()?;
    Ok(plan)
}

/// Lists the steps of a plan, ordered by `order_index` ascending.
pub fn list_steps(conn: &Connection, plan_id: &str) -> Result<Vec<RestorePlanStep>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, plan_id, order_index, software_name, target_version, winget_id, source
         FROM restore_plan_steps
         WHERE plan_id = ?1
         ORDER BY order_index",
    )?;
    let rows = stmt.query_map(params![plan_id], row_to_step)?;
    let mut steps = Vec::new();
    for row in rows {
        steps.push(row?);
    }
    Ok(steps)
}

/// Inserts a new restore job row.
pub fn insert_job(conn: &Connection, job: &RestoreJob) -> Result<(), CoreError> {
    conn.execute(
        "INSERT INTO restore_jobs
            (id, plan_id, device_id, status, started_at, finished_at,
             total_steps, succeeded_count, failed_count, skipped_count)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            job.id,
            job.plan_id,
            job.device_id,
            job.status,
            job.started_at,
            job.finished_at,
            job.total_steps,
            job.succeeded_count,
            job.failed_count,
            job.skipped_count,
        ],
    )?;
    Ok(())
}

/// Updates a restore job's status, completion time, and tallies.
pub fn update_job(conn: &Connection, job: &RestoreJob) -> Result<(), CoreError> {
    conn.execute(
        "UPDATE restore_jobs
         SET status = ?2, finished_at = ?3, total_steps = ?4,
             succeeded_count = ?5, failed_count = ?6, skipped_count = ?7
         WHERE id = ?1",
        params![
            job.id,
            job.status,
            job.finished_at,
            job.total_steps,
            job.succeeded_count,
            job.failed_count,
            job.skipped_count,
        ],
    )?;
    Ok(())
}

/// Inserts a single per-step result row.
pub fn insert_step_result(conn: &Connection, result: &RestoreStepResult) -> Result<(), CoreError> {
    conn.execute(
        "INSERT INTO restore_step_results
            (id, job_id, step_id, software_name, status, message)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            result.id,
            result.job_id,
            result.step_id,
            result.software_name,
            result.status,
            result.message,
        ],
    )?;
    Ok(())
}

/// Lists all restore jobs, newest first (`started_at DESC`).
pub fn list_jobs(conn: &Connection) -> Result<Vec<RestoreJob>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, plan_id, device_id, status, started_at, finished_at,
                total_steps, succeeded_count, failed_count, skipped_count
         FROM restore_jobs
         ORDER BY started_at DESC",
    )?;
    let rows = stmt.query_map([], row_to_job)?;
    let mut jobs = Vec::new();
    for row in rows {
        jobs.push(row?);
    }
    Ok(jobs)
}

/// Lists the per-step results for a job, in insertion order.
pub fn list_step_results(
    conn: &Connection,
    job_id: &str,
) -> Result<Vec<RestoreStepResult>, CoreError> {
    let mut stmt = conn.prepare(
        "SELECT id, job_id, step_id, software_name, status, message
         FROM restore_step_results
         WHERE job_id = ?1
         ORDER BY rowid",
    )?;
    let rows = stmt.query_map(params![job_id], row_to_step_result)?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

/// Maps a `restore_plans` row to a [`RestorePlan`].
fn row_to_plan(row: &rusqlite::Row<'_>) -> rusqlite::Result<RestorePlan> {
    Ok(RestorePlan {
        id: row.get(0)?,
        device_id: row.get(1)?,
        snapshot_id: row.get(2)?,
        name: row.get(3)?,
        created_at: row.get(4)?,
        step_count: row.get(5)?,
    })
}

/// Maps a `restore_plan_steps` row to a [`RestorePlanStep`].
fn row_to_step(row: &rusqlite::Row<'_>) -> rusqlite::Result<RestorePlanStep> {
    Ok(RestorePlanStep {
        id: row.get(0)?,
        plan_id: row.get(1)?,
        order_index: row.get(2)?,
        software_name: row.get(3)?,
        target_version: row.get(4)?,
        winget_id: row.get(5)?,
        source: row.get(6)?,
    })
}

/// Maps a `restore_jobs` row to a [`RestoreJob`].
fn row_to_job(row: &rusqlite::Row<'_>) -> rusqlite::Result<RestoreJob> {
    Ok(RestoreJob {
        id: row.get(0)?,
        plan_id: row.get(1)?,
        device_id: row.get(2)?,
        status: row.get(3)?,
        started_at: row.get(4)?,
        finished_at: row.get(5)?,
        total_steps: row.get(6)?,
        succeeded_count: row.get(7)?,
        failed_count: row.get(8)?,
        skipped_count: row.get(9)?,
    })
}

/// Maps a `restore_step_results` row to a [`RestoreStepResult`].
fn row_to_step_result(row: &rusqlite::Row<'_>) -> rusqlite::Result<RestoreStepResult> {
    Ok(RestoreStepResult {
        id: row.get(0)?,
        job_id: row.get(1)?,
        step_id: row.get(2)?,
        software_name: row.get(3)?,
        status: row.get(4)?,
        message: row.get(5)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::DeviceDnaSnapshot;
    use crate::storage::{db, device_repo};

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("enable foreign keys");
        db::run_migrations(&conn).expect("run migrations");
        conn
    }

    fn seed_snapshot(conn: &mut Connection) -> (String, String) {
        let device = device_repo::ensure_local_device(conn).expect("ensure device");
        let snapshot = DeviceDnaSnapshot {
            id: uuid::Uuid::new_v4().to_string(),
            device_id: device.id.clone(),
            captured_at: "2026-06-08T00:00:00Z".to_string(),
            schema_version: 1,
            source: "manual".to_string(),
            software_count: 0,
            config_count: 0,
        };
        device_repo::insert_snapshot(conn, &snapshot, &[], &[]).expect("insert snapshot");
        (device.id, snapshot.id)
    }

    #[test]
    fn plan_and_job_round_trip() {
        let mut conn = memory_db();
        let (device_id, snapshot_id) = seed_snapshot(&mut conn);

        let plan = RestorePlan {
            id: uuid::Uuid::new_v4().to_string(),
            device_id: device_id.clone(),
            snapshot_id,
            name: "Restore from 2026-06-08T00:00:00Z".to_string(),
            created_at: "2026-06-08T00:00:00Z".to_string(),
            step_count: 2,
        };
        let steps = vec![
            RestorePlanStep {
                id: uuid::Uuid::new_v4().to_string(),
                plan_id: plan.id.clone(),
                order_index: 0,
                software_name: "Alpha".to_string(),
                target_version: Some("1.0".to_string()),
                winget_id: None,
                source: "winget".to_string(),
            },
            RestorePlanStep {
                id: uuid::Uuid::new_v4().to_string(),
                plan_id: plan.id.clone(),
                order_index: 1,
                software_name: "Zeta".to_string(),
                target_version: None,
                winget_id: None,
                source: "winget".to_string(),
            },
        ];
        insert_plan(&mut conn, &plan, &steps).expect("insert plan");

        let plans = list_plans(&conn).expect("list plans");
        assert_eq!(plans.len(), 1);
        assert_eq!(plans[0].id, plan.id);
        assert_eq!(plans[0].step_count, 2);

        let fetched = get_plan(&conn, &plan.id).expect("get plan");
        assert!(fetched.is_some());
        assert!(get_plan(&conn, "missing").expect("get missing").is_none());

        let listed_steps = list_steps(&conn, &plan.id).expect("list steps");
        assert_eq!(listed_steps.len(), 2);
        assert_eq!(listed_steps[0].order_index, 0);
        assert_eq!(listed_steps[0].software_name, "Alpha");
        assert_eq!(listed_steps[1].software_name, "Zeta");

        let mut job = RestoreJob {
            id: uuid::Uuid::new_v4().to_string(),
            plan_id: plan.id.clone(),
            device_id,
            status: "running".to_string(),
            started_at: "2026-06-08T00:00:01Z".to_string(),
            finished_at: None,
            total_steps: 2,
            succeeded_count: 0,
            failed_count: 0,
            skipped_count: 0,
        };
        insert_job(&conn, &job).expect("insert job");

        job.status = "completed".to_string();
        job.finished_at = Some("2026-06-08T00:00:02Z".to_string());
        job.succeeded_count = 2;
        update_job(&conn, &job).expect("update job");

        let jobs = list_jobs(&conn).expect("list jobs");
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].status, "completed");
        assert_eq!(jobs[0].succeeded_count, 2);
        assert_eq!(jobs[0].finished_at.as_deref(), Some("2026-06-08T00:00:02Z"));

        let result = RestoreStepResult {
            id: uuid::Uuid::new_v4().to_string(),
            job_id: job.id.clone(),
            step_id: steps[0].id.clone(),
            software_name: "Alpha".to_string(),
            status: "succeeded".to_string(),
            message: None,
        };
        insert_step_result(&conn, &result).expect("insert result");

        let results = list_step_results(&conn, &job.id).expect("list results");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].software_name, "Alpha");
        assert_eq!(results[0].status, "succeeded");
    }
}
