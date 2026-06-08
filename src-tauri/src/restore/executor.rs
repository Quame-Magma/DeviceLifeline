//! Synchronous restore job execution.
//!
//! [`run_job`] walks a plan's steps in order, installs each through the supplied
//! [`Installer`], persists a [`RestoreStepResult`] per step, and finalizes the
//! [`RestoreJob`] with status and tallies. Execution is fully synchronous in
//! this cut: no background threads or Tauri events.

use rusqlite::Connection;

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::installer::Installer;
use crate::models::{RestoreJob, RestorePlan, RestorePlanStep, RestoreStepResult};
use crate::storage::restore_repo;

/// Job status while steps are still executing.
const STATUS_RUNNING: &str = "running";
/// Job status when every step succeeded or was skipped.
const STATUS_COMPLETED: &str = "completed";
/// Job status when at least one step failed.
const STATUS_COMPLETED_WITH_ERRORS: &str = "completed_with_errors";
/// Step-result status for a successful install.
const RESULT_SUCCEEDED: &str = "succeeded";
/// Step-result status for a failed install.
const RESULT_FAILED: &str = "failed";

/// Executes `plan`'s `steps` synchronously through `installer`, persisting the
/// job and a result per step, and returns the finalized [`RestoreJob`].
///
/// The job starts as `running`; once all steps are processed it becomes
/// `completed_with_errors` if any step failed, otherwise `completed`.
pub fn run_job(
    conn: &mut Connection,
    plan: &RestorePlan,
    steps: &[RestorePlanStep],
    installer: &dyn Installer,
) -> Result<RestoreJob, CoreError> {
    let mut job = RestoreJob {
        id: uuid::Uuid::new_v4().to_string(),
        plan_id: plan.id.clone(),
        device_id: plan.device_id.clone(),
        status: STATUS_RUNNING.to_string(),
        started_at: now_rfc3339()?,
        finished_at: None,
        total_steps: steps.len() as i64,
        succeeded_count: 0,
        failed_count: 0,
        skipped_count: 0,
    };
    restore_repo::insert_job(conn, &job)?;

    for step in steps {
        let outcome = installer.install(step);
        let result = RestoreStepResult {
            id: uuid::Uuid::new_v4().to_string(),
            job_id: job.id.clone(),
            step_id: step.id.clone(),
            software_name: step.software_name.clone(),
            status: outcome.status.clone(),
            message: outcome.message.clone(),
        };
        restore_repo::insert_step_result(conn, &result)?;

        match outcome.status.as_str() {
            RESULT_SUCCEEDED => job.succeeded_count += 1,
            RESULT_FAILED => job.failed_count += 1,
            _ => job.skipped_count += 1,
        }
    }

    job.status = if job.failed_count > 0 {
        STATUS_COMPLETED_WITH_ERRORS.to_string()
    } else {
        STATUS_COMPLETED.to_string()
    };
    job.finished_at = Some(now_rfc3339()?);
    restore_repo::update_job(conn, &job)?;

    Ok(job)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::installer::MockInstaller;
    use crate::models::{DeviceDnaSnapshot, SoftwareInventoryItem};
    use crate::restore::plan::build_plan;
    use crate::storage::{db, device_repo};

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("enable foreign keys");
        db::run_migrations(&conn).expect("run migrations");
        conn
    }

    fn item(snapshot_id: &str, name: &str) -> SoftwareInventoryItem {
        SoftwareInventoryItem {
            id: uuid::Uuid::new_v4().to_string(),
            snapshot_id: snapshot_id.to_string(),
            name: name.to_string(),
            version: Some("1.0".to_string()),
            publisher: None,
            install_date: None,
            source: "mock".to_string(),
            install_location: None,
        }
    }

    #[test]
    fn run_job_with_docker_failure_completes_with_errors() {
        let mut conn = memory_db();
        let device = device_repo::ensure_local_device(&conn).expect("ensure device");

        let snapshot = DeviceDnaSnapshot {
            id: uuid::Uuid::new_v4().to_string(),
            device_id: device.id.clone(),
            captured_at: "2026-06-08T00:00:00Z".to_string(),
            schema_version: 1,
            source: "manual".to_string(),
            software_count: 3,
            config_count: 0,
        };
        device_repo::insert_snapshot(&mut conn, &snapshot, &[], &[]).expect("insert snapshot");

        let software = vec![
            item(&snapshot.id, "Git"),
            item(&snapshot.id, "Docker Desktop"),
            item(&snapshot.id, "Node.js"),
        ];
        let (plan, steps) = build_plan(&device.id, &snapshot, &software).expect("build plan");
        restore_repo::insert_plan(&mut conn, &plan, &steps).expect("insert plan");

        let installer = MockInstaller::new();
        let job = run_job(&mut conn, &plan, &steps, &installer).expect("run job");

        assert_eq!(job.status, "completed_with_errors");
        assert_eq!(job.total_steps, 3);
        assert_eq!(job.succeeded_count, 2);
        assert_eq!(job.failed_count, 1);
        assert_eq!(job.skipped_count, 0);
        assert!(job.finished_at.is_some());

        let results = restore_repo::list_step_results(&conn, &job.id).expect("list results");
        assert_eq!(results.len(), 3);
        let failed = results
            .iter()
            .find(|r| r.software_name == "Docker Desktop")
            .expect("docker result");
        assert_eq!(failed.status, "failed");
        assert!(failed.message.is_some());
    }

    #[test]
    fn run_job_all_success_completes() {
        let mut conn = memory_db();
        let device = device_repo::ensure_local_device(&conn).expect("ensure device");

        let snapshot = DeviceDnaSnapshot {
            id: uuid::Uuid::new_v4().to_string(),
            device_id: device.id.clone(),
            captured_at: "2026-06-08T00:00:00Z".to_string(),
            schema_version: 1,
            source: "manual".to_string(),
            software_count: 2,
            config_count: 0,
        };
        device_repo::insert_snapshot(&mut conn, &snapshot, &[], &[]).expect("insert snapshot");

        let software = vec![item(&snapshot.id, "Git"), item(&snapshot.id, "Node.js")];
        let (plan, steps) = build_plan(&device.id, &snapshot, &software).expect("build plan");
        restore_repo::insert_plan(&mut conn, &plan, &steps).expect("insert plan");

        let installer = MockInstaller::new();
        let job = run_job(&mut conn, &plan, &steps, &installer).expect("run job");

        assert_eq!(job.status, "completed");
        assert_eq!(job.succeeded_count, 2);
        assert_eq!(job.failed_count, 0);
    }
}
