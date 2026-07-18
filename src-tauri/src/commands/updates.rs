//! IPC for Patch My PC–class software updates.

use tauri::State;

use crate::error::CoreError;
use crate::models::{SoftwareUpdate, UpdateApplyResult};
use crate::updates;
use crate::AppState;

#[tauri::command]
pub fn scan_software_updates(state: State<'_, AppState>) -> Result<Vec<SoftwareUpdate>, CoreError> {
    let conn = state.conn()?;
    updates::scan_updates(&conn)
}

#[tauri::command]
pub fn list_software_updates(state: State<'_, AppState>) -> Result<Vec<SoftwareUpdate>, CoreError> {
    let conn = state.conn()?;
    updates::list_updates(&conn)
}

#[tauri::command]
pub fn apply_software_updates(
    state: State<'_, AppState>,
    update_ids: Vec<String>,
    confirm: bool,
) -> Result<UpdateApplyResult, CoreError> {
    let conn = state.conn()?;
    updates::apply_updates(&conn, update_ids, confirm)
}
