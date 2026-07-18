//! Always-on agent status IPC.

use tauri::State;

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::AgentHeartbeat;
use crate::storage::{agent_repo, device_repo};
use crate::AppState;

#[tauri::command]
pub fn get_agent_status(state: State<'_, AppState>) -> Result<Option<AgentHeartbeat>, CoreError> {
    let conn = state.conn()?;
    agent_repo::latest(&conn)
}

/// Records an in-process agent heartbeat (UI-hosted sampler).
#[tauri::command]
pub fn ping_agent(state: State<'_, AppState>) -> Result<AgentHeartbeat, CoreError> {
    let conn = state.conn()?;
    let device = device_repo::ensure_local_device(&conn)?;
    let beat = AgentHeartbeat {
        id: uuid::Uuid::new_v4().to_string(),
        device_id: device.id,
        source: "ui_process".into(),
        captured_at: now_rfc3339()?,
        status: "running".into(),
        detail: Some("In-process sampler active while the app is open.".into()),
    };
    agent_repo::insert(&conn, &beat)?;
    Ok(beat)
}
