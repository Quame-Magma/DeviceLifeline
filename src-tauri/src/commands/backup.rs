//! IPC for Macrium-class volume shadows and schedules.

use tauri::State;

use crate::backup;
use crate::error::CoreError;
use crate::models::{BackupSchedule, ShadowRestoreResult, VolumeShadow};
use crate::AppState;

#[tauri::command]
pub fn create_volume_shadow(
    state: State<'_, AppState>,
    volume: Option<String>,
) -> Result<VolumeShadow, CoreError> {
    let conn = state.conn()?;
    backup::create_volume_shadow(&conn, volume)
}

#[tauri::command]
pub fn list_volume_shadows(state: State<'_, AppState>) -> Result<Vec<VolumeShadow>, CoreError> {
    let conn = state.conn()?;
    backup::list_volume_shadows(&conn)
}

#[tauri::command]
pub fn create_backup_schedule(
    state: State<'_, AppState>,
    volume: Option<String>,
    frequency: String,
) -> Result<BackupSchedule, CoreError> {
    let conn = state.conn()?;
    backup::create_backup_schedule(&conn, volume, frequency)
}

#[tauri::command]
pub fn list_backup_schedules(
    state: State<'_, AppState>,
) -> Result<Vec<BackupSchedule>, CoreError> {
    let conn = state.conn()?;
    backup::list_backup_schedules(&conn)
}

#[tauri::command]
pub fn set_backup_schedule_enabled(
    state: State<'_, AppState>,
    schedule_id: String,
    enabled: bool,
) -> Result<(), CoreError> {
    let conn = state.conn()?;
    backup::set_backup_schedule_enabled(&conn, schedule_id, enabled)
}

#[tauri::command]
pub fn run_backup_schedule_now(
    state: State<'_, AppState>,
    schedule_id: String,
) -> Result<VolumeShadow, CoreError> {
    let conn = state.conn()?;
    backup::run_backup_schedule_now(&conn, schedule_id)
}

#[tauri::command]
pub fn restore_from_shadow(
    state: State<'_, AppState>,
    shadow_row_id: String,
    relative_path: String,
    dest_path: String,
    confirm: bool,
) -> Result<ShadowRestoreResult, CoreError> {
    let conn = state.conn()?;
    backup::restore_from_shadow(&conn, shadow_row_id, relative_path, dest_path, confirm)
}
