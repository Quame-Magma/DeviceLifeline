//! Storage Intelligence IPC command handlers.

use tauri::State;

use crate::error::CoreError;
use crate::models::{
    LogicalDrive, StorageFolderNode, StorageItem, StorageScan, StorageScanResult,
};
use crate::storage::storage_repo;
use crate::storage_engine;
use crate::AppState;

/// Scans storage at an optional root path (defaults to temp / Downloads).
#[tauri::command]
pub fn scan_storage(
    state: State<'_, AppState>,
    root_path: Option<String>,
) -> Result<StorageScanResult, CoreError> {
    let conn = state.conn()?;
    storage_engine::scan_storage(&conn, root_path)
}

/// Returns the most recent storage scan, if any.
#[tauri::command]
pub fn get_latest_storage_scan(
    state: State<'_, AppState>,
) -> Result<Option<StorageScan>, CoreError> {
    let conn = state.conn()?;
    storage_repo::latest_scan(&conn)
}

/// Returns storage items for a scan, largest first.
#[tauri::command]
pub fn get_storage_items(
    state: State<'_, AppState>,
    scan_id: String,
) -> Result<Vec<StorageItem>, CoreError> {
    let conn = state.conn()?;
    storage_repo::list_items(&conn, &scan_id)
}

/// Hierarchical folder size map (WizTree-style). OS I/O only; no DB lock held.
#[tauri::command]
pub fn get_storage_folder_map(
    _state: State<'_, AppState>,
    root_path: Option<String>,
    max_depth: Option<u32>,
) -> Result<StorageFolderNode, CoreError> {
    storage_engine::folder_map(root_path, max_depth)
}

/// Volume-wide MFT-style size map (drive root). Prefer for multi-GB volumes.
///
/// Runs on a blocking pool thread so the UI event loop stays responsive while
/// the walk runs (hard-capped and deadline-bounded inside `volume_map`).
#[tauri::command]
pub async fn get_volume_map(
    _state: State<'_, AppState>,
    volume: Option<String>,
) -> Result<StorageFolderNode, CoreError> {
    tauri::async_runtime::spawn_blocking(move || storage_engine::volume::volume_map(volume))
        .await
        .map_err(|e| CoreError::Internal(format!("volume map task failed: {e}")))?
}

/// Lists mounted logical drives for disk pickers (volume map, VSS, schedules).
#[tauri::command]
pub fn list_logical_drives(
    _state: State<'_, AppState>,
) -> Result<Vec<LogicalDrive>, CoreError> {
    storage_engine::drives::list_logical_drives()
}
