//! Universal search IPC command handlers.

use tauri::State;

use crate::error::CoreError;
use crate::models::{FileIndexStatus, SearchHit};
use crate::search;
use crate::AppState;

/// Searches the FTS index for `query` (software, config, crashes, findings, files).
#[tauri::command]
pub fn search_all(state: State<'_, AppState>, query: String) -> Result<Vec<SearchHit>, CoreError> {
    let conn = state.conn()?;
    search::search(&conn, &query)
}

/// Rebuilds metadata FTS documents. Returns document count added.
#[tauri::command]
pub fn rebuild_search_index(state: State<'_, AppState>) -> Result<i64, CoreError> {
    let conn = state.conn()?;
    search::rebuild_index(&conn)
}

/// Rebuilds scoped filesystem file index (Everything-style). Returns status.
#[tauri::command]
pub fn rebuild_file_index(state: State<'_, AppState>) -> Result<FileIndexStatus, CoreError> {
    let conn = state.conn()?;
    search::file_index::rebuild_file_index(&conn)
}

/// Rebuilds metadata + file index.
#[tauri::command]
pub fn rebuild_all_search(state: State<'_, AppState>) -> Result<FileIndexStatus, CoreError> {
    let conn = state.conn()?;
    search::rebuild_all(&conn)
}

/// Last file index status.
#[tauri::command]
pub fn get_file_index_status(state: State<'_, AppState>) -> Result<FileIndexStatus, CoreError> {
    let conn = state.conn()?;
    search::file_index::file_index_status(&conn)
}

/// Rebuild file index from NTFS USN journal (or volume walk fallback).
#[tauri::command]
pub fn rebuild_usn_index(
    state: State<'_, AppState>,
    volume: Option<String>,
) -> Result<FileIndexStatus, CoreError> {
    let conn = state.conn()?;
    search::usn::rebuild_usn_index(&conn, volume)
}
