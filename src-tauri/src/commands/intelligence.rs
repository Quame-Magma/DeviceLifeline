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

/// Returns local-only Copilot status (Qwen3 + heuristics). No cloud providers.
#[tauri::command]
pub fn get_copilot_status() -> Result<serde_json::Value, CoreError> {
    let configured = crate::diagnosis::llm::configured_providers();
    let (provider, model, llm_configured) = crate::diagnosis::llm::active_provider_status();
    let local = crate::diagnosis::llm::local_qwen_status();
    let install = crate::diagnosis::llm::local_qwen_install_progress();
    Ok(serde_json::json!({
        "llmConfigured": llm_configured,
        "provider": provider,
        "model": model,
        "availableProviders": configured,
        "local": {
            "provider": "local-qwen3",
            "model": local.model,
            "endpoint": local.endpoint,
            "modelPath": local.model_path,
            "runtimePath": local.runtime_path,
            "modelInstalled": local.model_installed,
            "runtimeInstalled": local.runtime_installed,
            "ready": local.ready,
            "modelDownloadUrl": local.model_download_url,
            "runtimeDownloadUrl": local.runtime_download_url,
            "installPhase": install.phase,
            "installPercent": install.percent,
            "installMessage": install.message,
            "installError": install.error,
            "installBusy": install.busy,
        },
    }))
}

/// Starts in-app download of llama-server + Qwen3 into the user app-data folder.
#[tauri::command]
pub fn start_local_qwen_install() -> Result<serde_json::Value, CoreError> {
    crate::diagnosis::llm::start_local_qwen_install()
        .map_err(CoreError::Internal)?;
    let p = crate::diagnosis::llm::local_qwen_install_progress();
    Ok(serde_json::to_value(p).unwrap_or_else(|_| serde_json::json!({})))
}

/// Poll progress of an in-app local model install.
#[tauri::command]
pub fn get_local_qwen_install_progress() -> Result<serde_json::Value, CoreError> {
    let p = crate::diagnosis::llm::local_qwen_install_progress();
    Ok(serde_json::to_value(p).unwrap_or_else(|_| serde_json::json!({})))
}
