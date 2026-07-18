//! Windows process enrichment: threads, handles, modules, services.
//! Uses PowerShell / Get-Process for portability without heavy FFI.

use crate::models::{ProcessModule, ServiceInfo};

/// Enriches a process with thread count, handle count, working set, and modules.
pub fn enrich_process(pid: u32) -> Enrichment {
    #[cfg(windows)]
    {
        windows_enrich(pid)
    }
    #[cfg(not(windows))]
    {
        let _ = pid;
        Enrichment::default()
    }
}

/// Lists Windows services (or mock on non-Windows).
pub fn list_services() -> Vec<ServiceInfo> {
    #[cfg(windows)]
    {
        windows_services()
    }
    #[cfg(not(windows))]
    {
        vec![
            ServiceInfo {
                name: "mock-svc".into(),
                display_name: "Mock Service".into(),
                status: "Running".into(),
                start_type: Some("Automatic".into()),
                pid: Some(1000),
                path: Some(r"C:\Windows\System32\mock.exe".into()),
                account: Some("LocalSystem".into()),
            },
            ServiceInfo {
                name: "mock-manual".into(),
                display_name: "Mock Manual Service".into(),
                status: "Stopped".into(),
                start_type: Some("Manual".into()),
                pid: None,
                path: None,
                account: Some("LocalSystem".into()),
            },
        ]
    }
}

#[derive(Default, Clone, Debug)]
pub struct Enrichment {
    pub thread_count: Option<u32>,
    pub handle_count: Option<u32>,
    pub working_set_bytes: Option<u64>,
    pub modules: Vec<ProcessModule>,
    pub user: Option<String>,
    pub cmd: Option<String>,
}

#[cfg(windows)]
fn windows_enrich(pid: u32) -> Enrichment {
    let script = format!(
        r#"
$ErrorActionPreference='SilentlyContinue'
$p = Get-Process -Id {pid} -ErrorAction SilentlyContinue
if (-not $p) {{ '{{}}' ; exit }}
$mods = @()
try {{
  $mods = @($p.Modules | Select-Object -First 80 | ForEach-Object {{
    [pscustomobject]@{{
      name = $_.ModuleName
      path = $_.FileName
      size = [int64]$_.ModuleMemorySize
    }}
  }})
}} catch {{}}
$cim = Get-CimInstance Win32_Process -Filter "ProcessId={pid}" -ErrorAction SilentlyContinue
[pscustomobject]@{{
  threads = [int]$p.Threads.Count
  handles = [int]$p.HandleCount
  ws = [int64]$p.WorkingSet64
  user = $null
  cmd = if ($cim) {{ $cim.CommandLine }} else {{ $null }}
  modules = $mods
}} | ConvertTo-Json -Compress -Depth 5
"#,
        pid = pid
    );

    let output = crate::process_win::silent_command("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output();

    let Ok(output) = output else {
        return Enrichment::default();
    };
    if !output.status.success() {
        return Enrichment::default();
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let trimmed = text.trim();
    if trimmed.is_empty() || trimmed == "{}" {
        return Enrichment::default();
    }
    let v: serde_json::Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => return Enrichment::default(),
    };

    let mut modules = Vec::new();
    if let Some(arr) = v.get("modules").and_then(|m| m.as_array()) {
        for m in arr {
            let name = m
                .get("name")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            if name.is_empty() {
                continue;
            }
            modules.push(ProcessModule {
                name,
                path: m.get("path").and_then(|x| x.as_str()).map(|s| s.into()),
                base_address: None,
                size_bytes: m.get("size").and_then(|x| x.as_u64()),
            });
        }
    }

    Enrichment {
        thread_count: v.get("threads").and_then(|x| x.as_u64()).map(|n| n as u32),
        handle_count: v.get("handles").and_then(|x| x.as_u64()).map(|n| n as u32),
        working_set_bytes: v.get("ws").and_then(|x| x.as_u64()),
        modules,
        user: v.get("user").and_then(|x| x.as_str()).map(|s| s.into()),
        cmd: v
            .get("cmd")
            .and_then(|x| x.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.into()),
    }
}

#[cfg(windows)]
fn windows_services() -> Vec<ServiceInfo> {
    let script = r#"
$ErrorActionPreference='SilentlyContinue'
Get-CimInstance Win32_Service | Select-Object -First 400 Name, DisplayName, State, StartMode, ProcessId, PathName, StartName |
  ForEach-Object {
    [pscustomobject]@{
      name = $_.Name
      displayName = $_.DisplayName
      status = $_.State
      startType = $_.StartMode
      pid = if ($_.ProcessId -and $_.ProcessId -ne 0) { [int]$_.ProcessId } else { $null }
      path = $_.PathName
      account = $_.StartName
    }
  } | ConvertTo-Json -Compress -Depth 4
"#;
    let output = crate::process_win::silent_command("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output();
    let Ok(output) = output else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let value: serde_json::Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let arr = if value.is_array() {
        value.as_array().cloned().unwrap_or_default()
    } else {
        vec![value]
    };
    arr.into_iter()
        .filter_map(|v| {
            let name = v.get("name")?.as_str()?.to_string();
            Some(ServiceInfo {
                name: name.clone(),
                display_name: v
                    .get("displayName")
                    .and_then(|x| x.as_str())
                    .unwrap_or(&name)
                    .to_string(),
                status: v
                    .get("status")
                    .and_then(|x| x.as_str())
                    .unwrap_or("Unknown")
                    .to_string(),
                start_type: v
                    .get("startType")
                    .and_then(|x| x.as_str())
                    .map(|s| s.into()),
                pid: v.get("pid").and_then(|x| x.as_u64()).map(|n| n as u32),
                path: v.get("path").and_then(|x| x.as_str()).map(|s| s.into()),
                account: v.get("account").and_then(|x| x.as_str()).map(|s| s.into()),
            })
        })
        .collect()
}
