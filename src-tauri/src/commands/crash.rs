//! Crash Intelligence IPC command handlers.
//!
//! Thin IPC adapters: they lock shared state and delegate to the `crash` and
//! `storage` layers. They contain no business logic and no direct SQL (see
//! doc 48 §4.1).

use tauri::State;

use crate::crash;
use crate::error::CoreError;
use crate::models::CrashEvent;
use crate::storage::crash_repo;
use crate::AppState;

/// Scans the OS event log for crash / stability events, persists any new ones,
/// and returns the full list newest-first.
#[tauri::command]
pub fn scan_crash_events(state: State<'_, AppState>) -> Result<Vec<CrashEvent>, CoreError> {
    let mut conn = state
        .db
        .lock()
        .map_err(|_| CoreError::Internal("database lock poisoned".to_string()))?;
    crash::scan_and_store(&mut conn)
}

/// Returns all recorded crash events, newest first.
#[tauri::command]
pub fn get_crash_events(state: State<'_, AppState>) -> Result<Vec<CrashEvent>, CoreError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| CoreError::Internal("database lock poisoned".to_string()))?;
    crash_repo::list_events(&conn)
}
