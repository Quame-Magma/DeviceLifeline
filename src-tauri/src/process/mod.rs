//! Live process intelligence (Process Hacker / Sysinternals direction).
//!
//! Lists processes with cmd/user/threads/handles/modules, process trees,
//! services inventory, and confirmed kill (optionally process tree).

pub mod deep;
pub mod enrich;
pub mod risk;

use std::collections::HashMap;
use std::thread::sleep;

use sysinfo::{ProcessesToUpdate, System, MINIMUM_CPU_UPDATE_INTERVAL};

use crate::actions::{self, RISK_PRIVILEGED};
use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::{
    ProcessInfo, ProcessKillResult, ProcessSnapshot, ProcessTreeNode, ServiceInfo,
};
use rusqlite::Connection;

use risk::{score_process, ProcessRiskInput};

/// Default number of processes returned in a top snapshot.
pub const DEFAULT_TOP_N: usize = 80;

/// Protected process name basenames (lowercase) that kill refuses by default.
const PROTECTED_NAMES: &[&str] = &[
    "system",
    "idle",
    "system idle process",
    "smss",
    "csrss",
    "wininit",
    "services",
    "lsass",
    "winlogon",
    "registry",
    "memory compression",
    "secure system",
    "fontdrvhost",
    "dwm",
];

/// Captures a live process snapshot sorted by memory then CPU.
pub fn list_processes(top_n: Option<usize>) -> Result<ProcessSnapshot, CoreError> {
    let limit = top_n.unwrap_or(DEFAULT_TOP_N).max(1);
    let mut processes = collect_all_processes()?;
    processes.sort_by(|a, b| {
        b.memory_bytes.cmp(&a.memory_bytes).then_with(|| {
            b.cpu_usage
                .partial_cmp(&a.cpu_usage)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
    });
    processes.truncate(limit);

    let (total_cpu, total_memory) = host_totals()?;
    Ok(ProcessSnapshot {
        captured_at: now_rfc3339()?,
        total_cpu,
        total_memory,
        processes,
    })
}

/// Full process list (capped for safety) used for trees.
pub fn list_all_processes(max: usize) -> Result<ProcessSnapshot, CoreError> {
    let mut processes = collect_all_processes()?;
    processes.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    if processes.len() > max {
        processes.truncate(max);
    }
    let (total_cpu, total_memory) = host_totals()?;
    Ok(ProcessSnapshot {
        captured_at: now_rfc3339()?,
        total_cpu,
        total_memory,
        processes,
    })
}

/// Builds a forest of process trees from a live sample.
pub fn process_tree(max: Option<usize>) -> Result<Vec<ProcessTreeNode>, CoreError> {
    let snapshot = list_all_processes(max.unwrap_or(400))?;
    Ok(build_forest(&snapshot.processes))
}

/// Detail for a single PID with modules/threads/handles enrichment.
pub fn get_process(pid: u32) -> Result<Option<ProcessInfo>, CoreError> {
    let processes = collect_all_processes()?;
    let mut found = processes.into_iter().find(|p| p.pid == pid);
    if let Some(ref mut p) = found {
        apply_enrichment(p);
    }
    Ok(found)
}

/// Windows services inventory (Process Hacker services tab direction).
pub fn list_services() -> Result<Vec<ServiceInfo>, CoreError> {
    Ok(enrich::list_services())
}

/// Terminates a process after confirmation. Protected system processes refused.
/// When `tree` is true, uses process-tree kill (`taskkill /T` on Windows).
pub fn kill_process(
    conn: Option<&Connection>,
    pid: u32,
    confirm: bool,
    tree: bool,
) -> Result<ProcessKillResult, CoreError> {
    if !confirm {
        return Err(CoreError::Internal(
            "kill_process requires confirm=true".into(),
        ));
    }
    if pid == 0 || pid == 4 {
        return Ok(ProcessKillResult {
            pid,
            name: "System".into(),
            success: false,
            message: "Refused: protected system process.".into(),
            action_id: None,
            tree,
        });
    }

    let info = get_process(pid)?;
    let name = info
        .as_ref()
        .map(|p| p.name.clone())
        .unwrap_or_else(|| format!("pid-{pid}"));

    if is_protected(&name) {
        return Ok(ProcessKillResult {
            pid,
            name,
            success: false,
            message: "Refused: protected system process name.".into(),
            action_id: None,
            tree,
        });
    }

    let mut action_id = None;
    if let Some(conn) = conn {
        let preview =
            serde_json::json!({ "pid": pid, "name": name, "confirm": true, "tree": tree })
                .to_string();
        if let Ok(action) = actions::record_action(
            conn,
            if tree {
                "process_kill_tree"
            } else {
                "process_kill"
            },
            RISK_PRIVILEGED,
            &format!(
                "Terminate process {} {name} ({pid})",
                if tree { "tree" } else { "" }
            ),
            Some("User-confirmed process termination."),
            "running",
            Some(&preview),
        ) {
            action_id = Some(action.id.clone());
        }
    }

    let result = terminate_pid(pid, &name, tree);

    if let (Some(conn), Some(id)) = (conn, action_id.as_deref()) {
        let status = if result.success {
            "completed"
        } else {
            "failed"
        };
        let _ = actions::complete_action(conn, id, status, Some(&result.message));
    }

    Ok(ProcessKillResult {
        pid,
        name,
        success: result.success,
        message: result.message,
        action_id,
        tree,
    })
}

struct KillOutcome {
    success: bool,
    message: String,
}

fn terminate_pid(pid: u32, name: &str, tree: bool) -> KillOutcome {
    #[cfg(windows)]
    {
        let mut args = vec!["/PID".to_string(), pid.to_string(), "/F".to_string()];
        if tree {
            args.push("/T".to_string());
        }
        let output = crate::process_win::silent_command("taskkill").args(&args).output();
        match output {
            Ok(out) if out.status.success() => KillOutcome {
                success: true,
                message: if tree {
                    format!("Terminated process tree for {name} (PID {pid}).")
                } else {
                    format!("Terminated {name} (PID {pid}).")
                },
            },
            Ok(out) => {
                let err = String::from_utf8_lossy(&out.stderr);
                let stdout = String::from_utf8_lossy(&out.stdout);
                KillOutcome {
                    success: false,
                    message: format!("taskkill failed: {} {}", err.trim(), stdout.trim())
                        .trim()
                        .into(),
                }
            }
            Err(e) => KillOutcome {
                success: false,
                message: format!("taskkill spawn failed: {e}"),
            },
        }
    }
    #[cfg(not(windows))]
    {
        let _ = tree;
        use std::io::ErrorKind;
        match crate::process_win::silent_command("kill")
            .args(["-TERM", &pid.to_string()])
            .output()
        {
            Ok(out) if out.status.success() => KillOutcome {
                success: true,
                message: format!("Sent SIGTERM to {name} (PID {pid})."),
            },
            Ok(out) => KillOutcome {
                success: false,
                message: format!(
                    "kill failed: {}",
                    String::from_utf8_lossy(&out.stderr).trim()
                ),
            },
            Err(e) if e.kind() == ErrorKind::NotFound => KillOutcome {
                success: false,
                message: "kill command not found".into(),
            },
            Err(e) => KillOutcome {
                success: false,
                message: format!("kill failed: {e}"),
            },
        }
    }
}

fn apply_enrichment(p: &mut ProcessInfo) {
    let e = enrich::enrich_process(p.pid);
    if p.thread_count.is_none() {
        p.thread_count = e.thread_count;
    }
    p.handle_count = e.handle_count.or(p.handle_count);
    p.working_set_bytes = e.working_set_bytes.or(p.working_set_bytes);
    if p.cmd.is_none() {
        p.cmd = e.cmd;
    }
    if p.user.is_none() {
        p.user = e.user;
    }
    if !e.modules.is_empty() {
        p.modules = e.modules;
    }
}

fn is_protected(name: &str) -> bool {
    let base = name
        .trim()
        .trim_end_matches(".exe")
        .trim_end_matches(".EXE")
        .to_lowercase();
    PROTECTED_NAMES.iter().any(|p| *p == base)
}

fn host_totals() -> Result<(f64, u64), CoreError> {
    let mut sys = System::new();
    sys.refresh_cpu_usage();
    sleep(MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    Ok((f64::from(sys.global_cpu_usage()), sys.used_memory()))
}

fn collect_all_processes() -> Result<Vec<ProcessInfo>, CoreError> {
    let mut sys = System::new();
    sys.refresh_cpu_usage();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    sleep(MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu_usage();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    sys.refresh_memory();

    // Map pid -> name for parent resolution.
    let mut names: HashMap<u32, String> = HashMap::new();
    for (pid, proc_) in sys.processes() {
        names.insert(
            pid.as_u32(),
            proc_.name().to_string_lossy().to_string(),
        );
    }

    // Children counts.
    let mut child_counts: HashMap<u32, u32> = HashMap::new();
    for proc_ in sys.processes().values() {
        if let Some(parent) = proc_.parent() {
            *child_counts.entry(parent.as_u32()).or_insert(0) += 1;
        }
    }

    let processes: Vec<ProcessInfo> = sys
        .processes()
        .iter()
        .map(|(pid, proc_)| {
            let name = proc_.name().to_string_lossy().to_string();
            let path = proc_
                .exe()
                .map(|p| p.display().to_string())
                .filter(|s| !s.is_empty());
            let memory_bytes = proc_.memory();
            let cpu_usage = f64::from(proc_.cpu_usage());
            let parent_pid = proc_.parent().map(|p| p.as_u32());
            let status = format!("{:?}", proc_.status());
            let cmd = {
                let c: Vec<String> = proc_
                    .cmd()
                    .iter()
                    .map(|s| s.to_string_lossy().to_string())
                    .collect();
                if c.is_empty() {
                    None
                } else {
                    Some(c.join(" "))
                }
            };
            let user = proc_.user_id().map(|u| format!("{u:?}"));
            let thread_count: Option<u32> = None;
            let parent_name = parent_pid.and_then(|pp| names.get(&pp).cloned());
            let children_count = child_counts.get(&pid.as_u32()).copied().unwrap_or(0);

            let scored = score_process(&ProcessRiskInput {
                name: &name,
                cpu_usage,
                memory_bytes,
                path: path.as_deref(),
            });

            ProcessInfo {
                pid: pid.as_u32(),
                name,
                cpu_usage,
                memory_bytes,
                parent_pid,
                status,
                path,
                risk_score: scored.score,
                risk_reasons: scored.reasons,
                cmd,
                user,
                thread_count,
                parent_name,
                children_count,
                handle_count: None,
                working_set_bytes: Some(memory_bytes),
                modules: Vec::new(),
            }
        })
        .collect();

    Ok(processes)
}

fn build_forest(processes: &[ProcessInfo]) -> Vec<ProcessTreeNode> {
    let by_pid: HashMap<u32, ProcessInfo> =
        processes.iter().cloned().map(|p| (p.pid, p)).collect();
    let mut children_map: HashMap<u32, Vec<u32>> = HashMap::new();
    let mut roots: Vec<u32> = Vec::new();

    for p in processes {
        match p.parent_pid {
            Some(pp) if by_pid.contains_key(&pp) && pp != p.pid => {
                children_map.entry(pp).or_default().push(p.pid);
            }
            _ => roots.push(p.pid),
        }
    }

    fn build_node(
        pid: u32,
        by_pid: &HashMap<u32, ProcessInfo>,
        children_map: &HashMap<u32, Vec<u32>>,
        depth: u32,
    ) -> Option<ProcessTreeNode> {
        if depth > 32 {
            return None;
        }
        let process = by_pid.get(&pid)?.clone();
        let mut children = Vec::new();
        if let Some(kids) = children_map.get(&pid) {
            for kid in kids {
                if let Some(node) = build_node(*kid, by_pid, children_map, depth + 1) {
                    children.push(node);
                }
            }
        }
        children.sort_by(|a, b| {
            b.process
                .memory_bytes
                .cmp(&a.process.memory_bytes)
        });
        Some(ProcessTreeNode { process, children })
    }

    let mut forest = Vec::new();
    for root in roots {
        if let Some(node) = build_node(root, &by_pid, &children_map, 0) {
            forest.push(node);
        }
    }
    forest.sort_by(|a, b| {
        b.process
            .memory_bytes
            .cmp(&a.process.memory_bytes)
    });
    forest
}

/// Top process names and approximate combined memory percentage.
pub fn top_process_summary(top_n: usize) -> Result<(Vec<String>, Option<f64>), CoreError> {
    let snapshot = list_processes(Some(top_n))?;
    let names: Vec<String> = snapshot.processes.iter().map(|p| p.name.clone()).collect();
    let combined: u64 = snapshot.processes.iter().map(|p| p.memory_bytes).sum();
    let memory_pct = if snapshot.total_memory > 0 {
        Some((combined as f64 / snapshot.total_memory as f64) * 100.0)
    } else {
        None
    };
    Ok((names, memory_pct))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_processes_returns_sorted_snapshot() {
        let snapshot = list_processes(Some(10)).expect("list processes");
        assert!(!snapshot.captured_at.is_empty());
        assert!(snapshot.processes.len() <= 10);
        for window in snapshot.processes.windows(2) {
            assert!(window[0].memory_bytes >= window[1].memory_bytes);
        }
    }

    #[test]
    fn process_tree_builds() {
        let tree = process_tree(Some(50)).expect("tree");
        // Forest may be empty on restricted environments; must not panic.
        let _ = tree;
    }

    #[test]
    fn protected_names() {
        assert!(is_protected("csrss.exe"));
        assert!(is_protected("System"));
        assert!(!is_protected("chrome.exe"));
    }

    #[test]
    fn kill_requires_confirm() {
        let err = kill_process(None, 1, false, false).expect_err("confirm");
        assert!(err.to_string().contains("confirm"));
    }

    #[test]
    fn list_services_runs() {
        let services = list_services().expect("services");
        // Non-empty on Windows with real services; mock on other platforms.
        let _ = services;
    }
}
