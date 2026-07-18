//! Hardware Intelligence IPC.

use tauri::State;

use crate::error::CoreError;
use crate::hardware;
use crate::models::{DiskHealthSummary, HardwareSample};
use crate::storage::hardware_repo;
use crate::AppState;

/// Samples hardware (temps/GPU/SMART) outside the DB, then persists.
#[tauri::command]
pub fn collect_hardware_sample(state: State<'_, AppState>) -> Result<HardwareSample, CoreError> {
    // OS I/O first — no DB connection held.
    let mut sample = {
        let conn = state.conn()?;
        let device = crate::storage::device_repo::ensure_local_device(&conn)?;
        hardware::sample_hardware(&device.id)?
    };
    hardware::finalize_smart_ids(&mut sample);
    let conn = state.conn()?;
    hardware_repo::insert_sample(&conn, &sample)?;
    Ok(sample)
}

#[tauri::command]
pub fn get_latest_hardware_sample(
    state: State<'_, AppState>,
) -> Result<Option<HardwareSample>, CoreError> {
    let conn = state.conn()?;
    hardware_repo::latest_sample(&conn)
}

#[tauri::command]
pub fn get_hardware_samples(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<HardwareSample>, CoreError> {
    let conn = state.conn()?;
    hardware_repo::list_samples(&conn, limit.unwrap_or(20))
}

/// CrystalDisk-style per-disk health scores from SMART / reliability data.
#[tauri::command]
pub fn get_disk_health_summaries(
    state: State<'_, AppState>,
) -> Result<Vec<DiskHealthSummary>, CoreError> {
    let conn = state.conn()?;
    hardware::disk_health_summaries(&conn)
}
