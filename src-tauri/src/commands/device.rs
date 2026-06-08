//! Device DNA IPC command handlers.
//!
//! Each handler locks the shared SQLite connection from [`AppState`] and
//! delegates to the `dna` and `storage` layers, returning a
//! [`CoreError`](crate::error::CoreError) on failure (serialized to a string for
//! the JS side).

use tauri::State;

use crate::dna::snapshot;
use crate::error::CoreError;
use crate::models::{ConfigItem, Device, DeviceDnaSnapshot, SoftwareInventoryItem};
use crate::storage::device_repo;
use crate::AppState;

/// Captures a new Device DNA snapshot, persists it, and returns it.
#[tauri::command]
pub fn collect_dna_snapshot(state: State<'_, AppState>) -> Result<DeviceDnaSnapshot, CoreError> {
    let mut conn = state
        .db
        .lock()
        .map_err(|_| CoreError::Internal("database lock poisoned".to_string()))?;
    snapshot::capture_snapshot(&mut conn)
}

/// Returns all known devices.
#[tauri::command]
pub fn get_devices(state: State<'_, AppState>) -> Result<Vec<Device>, CoreError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| CoreError::Internal("database lock poisoned".to_string()))?;
    device_repo::list_devices(&conn)
}

/// Returns all snapshots, newest first.
#[tauri::command]
pub fn get_snapshots(state: State<'_, AppState>) -> Result<Vec<DeviceDnaSnapshot>, CoreError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| CoreError::Internal("database lock poisoned".to_string()))?;
    device_repo::list_snapshots(&conn)
}

/// Returns a single snapshot by id, or `None` if it does not exist.
#[tauri::command]
pub fn get_snapshot(
    state: State<'_, AppState>,
    snapshot_id: String,
) -> Result<Option<DeviceDnaSnapshot>, CoreError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| CoreError::Internal("database lock poisoned".to_string()))?;
    device_repo::get_snapshot(&conn, &snapshot_id)
}

/// Returns the software inventory for a snapshot, ordered by name.
#[tauri::command]
pub fn get_software_inventory(
    state: State<'_, AppState>,
    snapshot_id: String,
) -> Result<Vec<SoftwareInventoryItem>, CoreError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| CoreError::Internal("database lock poisoned".to_string()))?;
    device_repo::list_software(&conn, &snapshot_id)
}

/// Returns the system-configuration items for a snapshot, ordered by kind then name.
#[tauri::command]
pub fn get_config_items(
    state: State<'_, AppState>,
    snapshot_id: String,
) -> Result<Vec<ConfigItem>, CoreError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| CoreError::Internal("database lock poisoned".to_string()))?;
    device_repo::list_config(&conn, &snapshot_id)
}
