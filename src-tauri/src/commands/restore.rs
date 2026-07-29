//! Restore & Install IPC command handlers.
//!
//! Each handler locks the shared SQLite connection from [`AppState`] and
//! delegates to the `restore`, `installer`, and `storage` layers. Commands that
//! open a transaction or run the executor deref the [`MutexGuard`] to a
//! `&mut Connection`; read-only commands borrow it immutably.

use tauri::State;

use crate::error::CoreError;
use crate::installer::{default_installer, dry_run_installer};
use crate::models::{RestoreJob, RestorePlan, RestorePlanStep, RestoreStepResult};
use crate::restore::{executor, plan};
use crate::storage::{device_repo, restore_repo};
use crate::AppState;

/// Generates a restore plan from a snapshot's software inventory, persists it,
/// and returns the new plan.
#[tauri::command]
pub fn create_restore_plan(
    state: State<'_, AppState>,
    snapshot_id: String,
) -> Result<RestorePlan, CoreError> {
    let mut conn = state.conn()?;

    let snapshot = device_repo::get_snapshot(&conn, &snapshot_id)?
        .ok_or_else(|| CoreError::NotFound(format!("snapshot {snapshot_id}")))?;
    let software = device_repo::list_software(&conn, &snapshot_id)?;
    let (new_plan, steps) = plan::build_plan(&snapshot.device_id, &snapshot, &software)?;
    restore_repo::insert_plan(&mut conn, &new_plan, &steps)?;
    Ok(new_plan)
}

/// Lists all restore plans, newest first.
#[tauri::command]
pub fn get_restore_plans(state: State<'_, AppState>) -> Result<Vec<RestorePlan>, CoreError> {
    let conn = state.conn()?;
    restore_repo::list_plans(&conn)
}

/// Lists the steps of a plan, ordered by position.
#[tauri::command]
pub fn get_restore_plan_steps(
    state: State<'_, AppState>,
    plan_id: String,
) -> Result<Vec<RestorePlanStep>, CoreError> {
    let conn = state.conn()?;
    restore_repo::list_steps(&conn, &plan_id)
}

/// Executes a restore plan synchronously and returns the finished job.
///
/// `mode` defaults to `"dryRun"`, which records a non-mutating simulation.
/// Passing `"install"` opts into the real platform installer and **requires**
/// `confirm: true` (same pattern as cleanup / driver install).
#[tauri::command]
pub fn run_restore(
    state: State<'_, AppState>,
    plan_id: String,
    mode: Option<String>,
    confirm: Option<bool>,
) -> Result<RestoreJob, CoreError> {
    let mut conn = state.conn()?;

    let restore_plan = restore_repo::get_plan(&conn, &plan_id)?
        .ok_or_else(|| CoreError::NotFound(format!("restore plan {plan_id}")))?;
    let steps = restore_repo::list_steps(&conn, &plan_id)?;
    let installer = match mode.as_deref() {
        Some("install") => {
            if confirm != Some(true) {
                return Err(CoreError::Internal(
                    "run_restore mode=install requires confirm=true".into(),
                ));
            }
            default_installer()
        }
        _ => dry_run_installer(),
    };
    executor::run_job(&mut conn, &restore_plan, &steps, installer.as_ref())
}

/// Lists all restore jobs, newest first.
#[tauri::command]
pub fn get_restore_jobs(state: State<'_, AppState>) -> Result<Vec<RestoreJob>, CoreError> {
    let conn = state.conn()?;
    restore_repo::list_jobs(&conn)
}

/// Lists the per-step results for a job.
#[tauri::command]
pub fn get_restore_step_results(
    state: State<'_, AppState>,
    job_id: String,
) -> Result<Vec<RestoreStepResult>, CoreError> {
    let conn = state.conn()?;
    restore_repo::list_step_results(&conn, &job_id)
}
