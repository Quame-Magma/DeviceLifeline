//! Intelligence spine IPC command handlers.
//!
//! Thin adapters over `intelligence`, `actions`, and storage repos.

use tauri::State;

use crate::actions;
use crate::error::CoreError;
use crate::intelligence;
use crate::models::{ActionAudit, DashboardIntelligence, IntelligenceFinding};
use crate::storage::{action_repo, intelligence_repo};
use crate::AppState;

/// Returns the Vision 2.0 dashboard intelligence aggregate.
#[tauri::command]
pub fn get_dashboard_intelligence(
    state: State<'_, AppState>,
) -> Result<DashboardIntelligence, CoreError> {
    let conn = state.conn()?;
    intelligence::get_dashboard_intelligence(&conn)
}

/// Lists intelligence findings. When `include_dismissed` is omitted/false,
/// dismissed findings are excluded.
#[tauri::command]
pub fn list_intelligence_findings(
    state: State<'_, AppState>,
    include_dismissed: Option<bool>,
) -> Result<Vec<IntelligenceFinding>, CoreError> {
    let conn = state.conn()?;
    intelligence_repo::list_findings(&conn, include_dismissed.unwrap_or(false))
}

/// Dismisses an intelligence finding by id.
#[tauri::command]
pub fn dismiss_finding(state: State<'_, AppState>, finding_id: String) -> Result<(), CoreError> {
    let conn = state.conn()?;
    let updated = intelligence_repo::dismiss(&conn, &finding_id)?;
    if updated == 0 {
        return Err(CoreError::NotFound(format!("finding {finding_id}")));
    }
    Ok(())
}

/// Lists action-audit entries newest first.
#[tauri::command]
pub fn list_action_audit(state: State<'_, AppState>) -> Result<Vec<ActionAudit>, CoreError> {
    let conn = state.conn()?;
    action_repo::list_actions(&conn)
}

/// Proposes a dry-run safe cleanup preview (no file deletion).
#[tauri::command]
pub fn propose_safe_cleanup(state: State<'_, AppState>) -> Result<ActionAudit, CoreError> {
    let conn = state.conn()?;
    actions::propose_safe_cleanup_preview(&conn)
}

/// Executes safe temp/cache cleanup. Requires `confirm: true`.
#[tauri::command]
pub fn execute_safe_cleanup(
    state: State<'_, AppState>,
    confirm: bool,
) -> Result<crate::models::CleanupResult, CoreError> {
    let conn = state.conn()?;
    actions::execute_safe_cleanup(&conn, confirm)
}

/// Whether a cloud LLM is configured (xAI, OpenAI, and/or Gemini).
#[tauri::command]
pub fn get_copilot_status() -> Result<serde_json::Value, CoreError> {
    let configured = crate::diagnosis::llm::configured_providers();
    let (provider, model, llm_configured) = crate::diagnosis::llm::active_provider_status();
    Ok(serde_json::json!({
        "llmConfigured": llm_configured,
        "provider": provider,
        "model": model,
        "availableProviders": configured,
    }))
}
