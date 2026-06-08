//! AI Detective IPC command handlers.
//!
//! Thin IPC adapters: they lock shared state and delegate to the `diagnosis`
//! and `storage` layers. They contain no business logic and no direct SQL (see
//! doc 48 §4.1).

use tauri::State;

use crate::diagnosis;
use crate::error::CoreError;
use crate::models::{DiagnosisFinding, DiagnosisSession};
use crate::storage::diagnosis_repo;
use crate::AppState;

/// Runs a single-shot diagnosis for `query`, persists the session and findings,
/// and returns the session (findings are fetched separately by id).
#[tauri::command]
pub fn run_diagnosis(
    state: State<'_, AppState>,
    query: String,
) -> Result<DiagnosisSession, CoreError> {
    let mut conn = state
        .db
        .lock()
        .map_err(|_| CoreError::Internal("database lock poisoned".to_string()))?;
    diagnosis::run_diagnosis(&mut conn, &query)
}

/// Returns all diagnosis sessions, newest first.
#[tauri::command]
pub fn get_diagnosis_sessions(
    state: State<'_, AppState>,
) -> Result<Vec<DiagnosisSession>, CoreError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| CoreError::Internal("database lock poisoned".to_string()))?;
    diagnosis_repo::list_sessions(&conn)
}

/// Returns the findings for a diagnosis session, ordered by position.
#[tauri::command]
pub fn get_diagnosis_findings(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<DiagnosisFinding>, CoreError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| CoreError::Internal("database lock poisoned".to_string()))?;
    diagnosis_repo::list_findings(&conn, &session_id)
}
