//! Driver Intelligence IPC.

use tauri::State;

use crate::drivers;
use crate::error::CoreError;
use crate::models::{DriverInfo, GpuCleanPlan, GpuCleanResult, VaultEntry};
use crate::storage::driver_repo;
use crate::AppState;

#[tauri::command]
pub fn scan_drivers(state: State<'_, AppState>) -> Result<Vec<DriverInfo>, CoreError> {
    let conn = state.conn()?;
    drivers::scan_drivers(&conn)
}

#[tauri::command]
pub fn list_drivers(state: State<'_, AppState>) -> Result<Vec<DriverInfo>, CoreError> {
    let conn = state.conn()?;
    driver_repo::list_drivers(&conn)
}

/// Dry-run GPU driver clean plan (DDU-class). `vendor`: nvidia|amd|intel|auto.
#[tauri::command]
pub fn preview_gpu_driver_clean(
    state: State<'_, AppState>,
    vendor: Option<String>,
) -> Result<GpuCleanPlan, CoreError> {
    let conn = state.conn()?;
    drivers::preview_gpu_driver_clean(&conn, vendor)
}

/// Create a System Restore point specifically for the GPU clean wizard gate.
#[tauri::command]
pub fn create_gpu_clean_restore_point(
    state: State<'_, AppState>,
) -> Result<VaultEntry, CoreError> {
    let conn = state.conn()?;
    drivers::create_gpu_clean_restore_point(&conn)
}

/// Execute allowlisted pnputil package removal after restore point + confirm.
#[tauri::command]
pub fn execute_gpu_driver_clean(
    state: State<'_, AppState>,
    plan_id: String,
    restore_point_id: String,
    vendor: Option<String>,
    confirm: bool,
) -> Result<GpuCleanResult, CoreError> {
    let conn = state.conn()?;
    drivers::execute_gpu_driver_clean(&conn, plan_id, restore_point_id, vendor, confirm)
}
