//! Setup Export / Import IPC command handlers.
//!
//! Thin IPC adapters: they lock shared state and delegate to the `setup` and
//! `storage` layers. They contain no business logic and no direct SQL (see
//! doc 48 §4.1).

use tauri::State;

use crate::error::CoreError;
use crate::models::{DeviceDnaSnapshot, SetupBundle};
use crate::setup;
use crate::AppState;

/// Builds a portable, checksummed setup bundle from a stored snapshot.
#[tauri::command]
pub fn export_setup(
    state: State<'_, AppState>,
    snapshot_id: String,
) -> Result<SetupBundle, CoreError> {
    let conn = state.conn()?;
    setup::build_bundle(&conn, &snapshot_id)
}

/// Imports a setup bundle (verifying its checksum) as a new local snapshot and
/// returns the created snapshot.
#[tauri::command]
pub fn import_setup(
    state: State<'_, AppState>,
    bundle_json: String,
) -> Result<DeviceDnaSnapshot, CoreError> {
    let mut conn = state.conn()?;
    setup::import_bundle(&mut conn, &bundle_json)
}
