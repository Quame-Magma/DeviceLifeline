//! Revo-class uninstall + leftovers IPC.

use tauri::State;

use crate::error::CoreError;
use crate::models::{InstalledApp, UninstallResult, UninstallScan};
use crate::uninstall;
use crate::AppState;

#[tauri::command]
pub fn list_installed_apps(_state: State<'_, AppState>) -> Result<Vec<InstalledApp>, CoreError> {
    uninstall::list_installed_apps()
}

#[tauri::command]
pub fn scan_uninstall_leftovers(
    _state: State<'_, AppState>,
    app_id: String,
) -> Result<UninstallScan, CoreError> {
    uninstall::scan_leftovers(&app_id)
}

#[tauri::command]
pub fn uninstall_app(
    state: State<'_, AppState>,
    app_id: String,
    confirm: bool,
) -> Result<UninstallResult, CoreError> {
    let conn = state.conn()?;
    uninstall::uninstall_app(&conn, &app_id, confirm)
}

#[tauri::command]
pub fn remove_uninstall_leftovers(
    state: State<'_, AppState>,
    app_id: String,
    paths: Vec<String>,
    confirm: bool,
) -> Result<UninstallResult, CoreError> {
    let conn = state.conn()?;
    uninstall::remove_leftovers(&conn, &app_id, paths, confirm)
}
