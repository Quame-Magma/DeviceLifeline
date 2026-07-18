//! Autoruns-class startup intelligence IPC.

use tauri::State;

use crate::error::CoreError;
use crate::models::{StartupEntry, StartupToggleResult};
use crate::startup;
use crate::AppState;

/// Live inventory of Run keys, Startup folders, tasks, and services.
#[tauri::command]
pub fn list_startup_entries(
    _state: State<'_, AppState>,
) -> Result<Vec<StartupEntry>, CoreError> {
    startup::list_startup_entries()
}

/// Enable or disable a startup entry. Requires `confirm: true`.
#[tauri::command]
pub fn set_startup_enabled(
    state: State<'_, AppState>,
    entry_id: String,
    enabled: bool,
    confirm: bool,
) -> Result<StartupToggleResult, CoreError> {
    let conn = state.conn()?;
    startup::set_startup_enabled(&conn, &entry_id, enabled, confirm)
}
