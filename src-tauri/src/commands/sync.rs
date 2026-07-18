//! Cloud-sync IPC command handlers.
//!
//! Thin IPC adapters: they lock shared state and delegate to the `sync` and
//! `storage` layers. They contain no business logic and no direct SQL (see
//! doc 48 §4.1).

use tauri::State;

use crate::error::CoreError;
use crate::models::SyncStatus;
use crate::storage::sync_repo;
use crate::sync;
use crate::AppState;

/// Builds the current sync status from the queue counts and client config.
fn build_status(conn: &rusqlite::Connection) -> Result<SyncStatus, CoreError> {
    Ok(SyncStatus {
        configured: sync::default_sync_client().is_configured(),
        pending: sync_repo::count_by_status(conn, "pending")?,
        synced: sync_repo::count_by_status(conn, "synced")?,
        failed: sync_repo::count_by_status(conn, "failed")?,
    })
}

/// Returns the current cloud-sync queue status.
#[tauri::command]
pub fn get_sync_status(state: State<'_, AppState>) -> Result<SyncStatus, CoreError> {
    let conn = state.conn()?;
    build_status(&conn)
}

/// Attempts to drain the sync queue via the configured client (a no-op until a
/// backend is configured) and returns the updated status.
#[tauri::command]
pub fn trigger_sync(state: State<'_, AppState>) -> Result<SyncStatus, CoreError> {
    let conn = state.conn()?;
    let client = sync::default_sync_client();
    sync::process_queue(&conn, client.as_ref())?;
    build_status(&conn)
}
