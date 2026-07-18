//! Health Intelligence IPC command handlers.
//!
//! Each handler locks the shared SQLite connection from [`AppState`] and
//! delegates to the `health` and `storage` layers. They contain no business
//! logic and no direct SQL (see doc 48 §4.1).

use tauri::State;

use crate::error::CoreError;
use crate::health;
use crate::models::{HealthAlert, HealthSample};
use crate::storage::{alerts_repo, health_repo};
use crate::AppState;

/// Captures a new health sample for the local device, persists it, and returns
/// it. OS sampling runs before a short-lived DB write (no long lock across I/O).
#[tauri::command]
pub fn collect_health_sample(state: State<'_, AppState>) -> Result<HealthSample, CoreError> {
    // Sample CPU/memory/disk outside any DB connection.
    let metrics = health::sampler::sample();
    let conn = state.conn()?;
    health::capture_sample_from_metrics(&conn, metrics)
}

/// Returns all health samples, newest first.
#[tauri::command]
pub fn get_health_samples(state: State<'_, AppState>) -> Result<Vec<HealthSample>, CoreError> {
    let conn = state.conn()?;
    health_repo::list_samples(&conn)
}

/// Returns the most recent health sample, or `None` if none have been recorded.
#[tauri::command]
pub fn get_latest_health_sample(
    state: State<'_, AppState>,
) -> Result<Option<HealthSample>, CoreError> {
    let conn = state.conn()?;
    health_repo::latest_sample(&conn)
}

/// Returns all health alerts, unacknowledged first then newest.
#[tauri::command]
pub fn get_health_alerts(state: State<'_, AppState>) -> Result<Vec<HealthAlert>, CoreError> {
    let conn = state.conn()?;
    alerts_repo::list_alerts(&conn)
}

/// Marks a health alert acknowledged.
#[tauri::command]
pub fn acknowledge_alert(state: State<'_, AppState>, alert_id: String) -> Result<(), CoreError> {
    let conn = state.conn()?;
    alerts_repo::acknowledge(&conn, &alert_id)?;
    Ok(())
}
