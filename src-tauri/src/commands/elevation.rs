//! Elevation status IPC.

use crate::elevation;
use crate::error::CoreError;

/// Returns whether the app is running elevated and whether auto-elevate is on.
#[tauri::command]
pub fn get_elevation_status() -> Result<serde_json::Value, CoreError> {
    Ok(elevation::status_json())
}

/// Explicitly request elevation (relaunch with UAC). Works in dev and release.
/// If relaunch succeeds this process exits; otherwise returns current status.
#[tauri::command]
pub fn request_elevation() -> Result<serde_json::Value, CoreError> {
    let _ = elevation::request_elevation_relaunch();
    Ok(elevation::status_json())
}
