//! CCleaner/Glary-class cleanup IPC.

use tauri::State;

use crate::cleanup;
use crate::error::CoreError;
use crate::models::{CleanupPreview, CleanupResult};
use crate::AppState;

#[tauri::command]
pub fn scan_cleanup_preview(state: State<'_, AppState>) -> Result<CleanupPreview, CoreError> {
    let conn = state.conn()?;
    cleanup::scan_cleanup_preview(&conn)
}

/// Long-running: re-scan + delete. Runs on blocking pool so the UI can show a spinner.
#[tauri::command]
pub async fn execute_cleanup(
    state: State<'_, AppState>,
    categories: Option<Vec<String>>,
    confirm: bool,
) -> Result<CleanupResult, CoreError> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db.get()?;
        cleanup::execute_cleanup(&conn, categories, confirm)
    })
    .await
    .map_err(|e| CoreError::Internal(format!("cleanup task failed: {e}")))?
}
