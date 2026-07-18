//! Process Intelligence IPC (Process Hacker / Sysinternals direction).

use tauri::State;

use crate::error::CoreError;
use crate::models::{
    ProcessDeepDetail, ProcessInfo, ProcessKillResult, ProcessSnapshot, ProcessTreeNode,
    ServiceInfo,
};
use crate::process;
use crate::AppState;

/// Lists live processes sorted by memory then CPU. Optional `top_n` (default 80).
#[tauri::command]
pub fn list_processes(
    _state: State<'_, AppState>,
    top_n: Option<usize>,
) -> Result<ProcessSnapshot, CoreError> {
    process::list_processes(top_n)
}

/// Process tree forest for explorer views.
#[tauri::command]
pub fn get_process_tree(
    _state: State<'_, AppState>,
    max: Option<usize>,
) -> Result<Vec<ProcessTreeNode>, CoreError> {
    process::process_tree(max)
}

/// Detail for a single process id (includes modules/threads/handles when available).
#[tauri::command]
pub fn get_process_detail(
    _state: State<'_, AppState>,
    pid: u32,
) -> Result<Option<ProcessInfo>, CoreError> {
    process::get_process(pid)
}

/// Terminates a process. Requires `confirm: true`. Optional process-tree kill.
#[tauri::command]
pub fn kill_process(
    state: State<'_, AppState>,
    pid: u32,
    confirm: bool,
    tree: Option<bool>,
) -> Result<ProcessKillResult, CoreError> {
    let conn = state.conn()?;
    process::kill_process(Some(&conn), pid, confirm, tree.unwrap_or(false))
}

/// Windows services inventory.
#[tauri::command]
pub fn list_services(_state: State<'_, AppState>) -> Result<Vec<ServiceInfo>, CoreError> {
    process::list_services()
}

/// Deep process detail: memory map, wait chains, token privileges, named handles.
#[tauri::command]
pub fn get_process_deep(
    _state: State<'_, AppState>,
    pid: u32,
) -> Result<ProcessDeepDetail, CoreError> {
    process::deep::get_process_deep(pid)
}
