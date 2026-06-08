//! Health Intelligence IPC command handlers.
//!
//! Each handler locks the shared SQLite connection from [`AppState`] and
//! delegates to the `health` and `storage` layers. They contain no business
//! logic and no direct SQL (see doc 48 §4.1).

use tauri::State;

use crate::error::CoreError;
use crate::health;
use crate::models::HealthSample;
use crate::storage::health_repo;
use crate::AppState;

/// Captures a new health sample for the local device, persists it, and returns
/// it.
#[tauri::command]
pub fn collect_health_sample(state: State<'_, AppState>) -> Result<HealthSample, CoreError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| CoreError::Internal("database lock poisoned".to_string()))?;
    health::capture_sample(&conn)
}

/// Returns all health samples, newest first.
#[tauri::command]
pub fn get_health_samples(state: State<'_, AppState>) -> Result<Vec<HealthSample>, CoreError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| CoreError::Internal("database lock poisoned".to_string()))?;
    health_repo::list_samples(&conn)
}

/// Returns the most recent health sample, or `None` if none have been recorded.
#[tauri::command]
pub fn get_latest_health_sample(
    state: State<'_, AppState>,
) -> Result<Option<HealthSample>, CoreError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| CoreError::Internal("database lock poisoned".to_string()))?;
    health_repo::latest_sample(&conn)
}
