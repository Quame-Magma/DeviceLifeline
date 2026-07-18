//! Behavioral security IPC.

use tauri::State;

use crate::error::CoreError;
use crate::models::SecurityFinding;
use crate::security;
use crate::storage::security_repo;
use crate::AppState;

#[tauri::command]
pub fn scan_security(state: State<'_, AppState>) -> Result<Vec<SecurityFinding>, CoreError> {
    // Process scan is OS I/O; security module opens process list before heavy writes.
    let conn = state.conn()?;
    security::scan_security(&conn)
}

#[tauri::command]
pub fn list_security_findings(
    state: State<'_, AppState>,
    include_dismissed: Option<bool>,
) -> Result<Vec<SecurityFinding>, CoreError> {
    let conn = state.conn()?;
    security_repo::list_findings(&conn, include_dismissed.unwrap_or(false))
}

#[tauri::command]
pub fn dismiss_security_finding(
    state: State<'_, AppState>,
    finding_id: String,
) -> Result<(), CoreError> {
    let conn = state.conn()?;
    let n = security_repo::dismiss(&conn, &finding_id)?;
    if n == 0 {
        return Err(CoreError::NotFound(format!("security finding {finding_id}")));
    }
    Ok(())
}
