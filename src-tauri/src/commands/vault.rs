//! Recovery Vault IPC.

use tauri::State;

use crate::error::CoreError;
use crate::models::VaultEntry;
use crate::vault;
use crate::AppState;

#[tauri::command]
pub fn list_vault_entries(state: State<'_, AppState>) -> Result<Vec<VaultEntry>, CoreError> {
    let conn = state.conn()?;
    vault::list_entries(&conn)
}

#[tauri::command]
pub fn create_restore_point(
    state: State<'_, AppState>,
    description: Option<String>,
) -> Result<VaultEntry, CoreError> {
    let conn = state.conn()?;
    vault::create_restore_point(&conn, description)
}

#[tauri::command]
pub fn create_dna_vault_backup(state: State<'_, AppState>) -> Result<VaultEntry, CoreError> {
    let mut conn = state.conn()?;
    vault::create_dna_vault_backup(&mut conn)
}

#[tauri::command]
pub fn create_directory_image(
    state: State<'_, AppState>,
    source_path: String,
) -> Result<VaultEntry, CoreError> {
    // File copy is heavy I/O; vault holds DB only for short insert at end.
    let conn = state.conn()?;
    vault::create_directory_image(&conn, source_path)
}
