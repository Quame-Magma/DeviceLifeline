//! Hardware Intelligence IPC.

use tauri::State;

use crate::error::CoreError;
use crate::hardware;
use crate::models::{DiskHealthSummary, HardwareSample};
use crate::storage::hardware_repo;
use crate::AppState;

/// Samples hardware (temps/GPU/SMART) outside the DB, then persists.
///
/// `depth`: `"quick"` for Overview smart-check (light, timeout-capped) or
/// `"full"` / omitted for Performance page deep sample.
///
/// Critical: never hold a SQLite connection across PowerShell / sensor I/O —
/// that stalls every other IPC handler via WAL busy waits.
#[tauri::command]
pub fn collect_hardware_sample(
    state: State<'_, AppState>,
    depth: Option<String>,
) -> Result<HardwareSample, CoreError> {
    let depth = hardware::SampleDepth::from_str_opt(depth.as_deref());
    let device_id = {
        let conn = state.conn()?;
        crate::storage::device_repo::ensure_local_device(&conn)?.id
    };
    // Heavy OS work with no DB handle open.
    let mut sample = hardware::sample_hardware(&device_id, depth)?;
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
