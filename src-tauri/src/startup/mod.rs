//! Autoruns-class startup intelligence: inventory + toggle with audit.

use std::fs;
use std::path::PathBuf;

use rusqlite::Connection;

use crate::actions::{self, RISK_PRIVILEGED, RISK_SAFE};
use crate::error::CoreError;
use crate::models::{StartupEntry, StartupToggleResult};

/// Lists live Autoruns-class startup entries across full category set.
pub fn list_startup_entries() -> Result<Vec<StartupEntry>, CoreError> {
    let mut entries = Vec::new();
    #[cfg(windows)]
    {
        collect_run_keys(&mut entries);
        collect_startup_folders(&mut entries);
        collect_tasks(&mut entries);
        collect_services_live(&mut entries);
        collect_kernel_drivers(&mut entries);
        collect_registry_value_entries(&mut entries);
        collect_bho_and_shell(&mut entries);
        collect_wmi_persistence(&mut entries);
    }
    #[cfg(not(windows))]
    {
        entries = mock_entries();
    }
    // Dedup by id
    let mut seen = std::collections::HashSet::new();
    entries.retain(|e| seen.insert(e.id.clone()));
    entries.sort_by(|a, b| {
        a.category
            .cmp(&b.category)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

/// Enable or disable a startup entry. Requires `confirm: true`.
pub fn set_startup_enabled(
    conn: &Connection,
    entry_id: &str,
    enabled: bool,
    confirm: bool,
) -> Result<StartupToggleResult, CoreError> {
    if !confirm {
        return Err(CoreError::Internal(
            "startup toggle requires confirm=true".into(),
        ));
    }

    let entries = list_startup_entries()?;
    let entry = entries
        .iter()
        .find(|e| e.id == entry_id)
        .ok_or_else(|| CoreError::NotFound(format!("startup entry {entry_id}")))?
        .clone();

    if !entry.can_toggle {
        return Err(CoreError::Internal(format!(
            "entry '{}' cannot be toggled from this UI",
            entry.name
        )));
    }

    let risk = if entry.scope == "machine" {
        RISK_PRIVILEGED
    } else {
        RISK_SAFE
    };
    let preview = serde_json::json!({
        "entryId": entry.id,
        "name": entry.name,
        "category": entry.category,
        "location": entry.location,
        "from": entry.enabled,
        "to": enabled,
    })
    .to_string();

    let action = actions::record_action(
        conn,
        if enabled {
            "startup_enable"
        } else {
            "startup_disable"
        },
        risk,
        &format!(
            "{} startup: {}",
            if enabled { "Enable" } else { "Disable" },
            entry.name
        ),
        Some(&entry.location),
        "running",
        Some(&preview),
    )?;

    let result = apply_toggle(&entry, enabled);
    match &result {
        Ok(msg) => {
            let _ = actions::complete_action(conn, &action.id, "completed", Some(msg));
            Ok(StartupToggleResult {
                entry_id: entry.id,
                enabled,
                status: "completed".into(),
                message: msg.clone(),
            })
        }
        Err(err) => {
            let msg = err.to_string();
            let _ = actions::complete_action(conn, &action.id, "failed", Some(&msg));
            Err(CoreError::Internal(msg))
        }
    }
}

fn apply_toggle(entry: &StartupEntry, enabled: bool) -> Result<String, String> {
    match entry.category.as_str() {
        "run_key" | "run_once" | "winlogon" | "appinit" | "image_hijack" | "boot_execute"
        | "explorer" | "codec" | "print_monitor" | "lsa" | "network_provider" | "winsock"
        | "knowndlls" | "internet_explorer" => toggle_run_key(entry, enabled),
        "startup_folder" => toggle_startup_folder(entry, enabled),
        "scheduled_task" => toggle_task(entry, enabled),
        "service" | "driver" => toggle_service(entry, enabled),
        "wmi" => Err("WMI persistence disable requires manual investigation; not auto-deleted".into()),
        other => Err(format!("unsupported category: {other}")),
    }
}

#[cfg(windows)]
fn toggle_run_key(entry: &StartupEntry, enabled: bool) -> Result<String, String> {
    use winreg::enums::{KEY_READ, KEY_SET_VALUE};
    use winreg::RegKey;

    // location format: "HKCU\\...\\Run" or "HKLM\\...\\Run"
    let (hive, subpath) = parse_reg_location(&entry.location)?;
    let root = RegKey::predef(hive);
    let key = root
        .open_subkey_with_flags(&subpath, KEY_READ | KEY_SET_VALUE)
        .map_err(|e| format!("open registry: {e}"))?;

    if enabled {
        // Re-enable: prefer restoring from .DeviceLifelineDisabled sibling value.
        let disabled_name = format!("{}.DeviceLifelineDisabled", entry.name);
        let cmd: String = key
            .get_value(&disabled_name)
            .or_else(|_| {
                entry
                    .command
                    .clone()
                    .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "no command"))
            })
            .map_err(|e| format!("missing original command: {e}"))?;
        key.set_value(&entry.name, &cmd)
            .map_err(|e| format!("set value: {e}"))?;
        let _ = key.delete_value(&disabled_name);
        Ok(format!("Enabled Run value '{}'", entry.name))
    } else {
        let cmd: String = key
            .get_value(&entry.name)
            .map_err(|e| format!("read value: {e}"))?;
        let disabled_name = format!("{}.DeviceLifelineDisabled", entry.name);
        let _ = key.set_value(&disabled_name, &cmd);
        key.delete_value(&entry.name)
            .map_err(|e| format!("delete value: {e}"))?;
        Ok(format!("Disabled Run value '{}' (saved for re-enable)", entry.name))
    }
}

#[cfg(not(windows))]
fn toggle_run_key(_entry: &StartupEntry, _enabled: bool) -> Result<String, String> {
    Err("registry toggle only on Windows".into())
}

#[cfg(windows)]
fn parse_reg_location(location: &str) -> Result<(winreg::HKEY, String), String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    let loc = location.replace('/', "\\");
    if let Some(rest) = loc.strip_prefix("HKCU\\") {
        return Ok((HKEY_CURRENT_USER, rest.to_string()));
    }
    if let Some(rest) = loc.strip_prefix("HKLM\\") {
        return Ok((HKEY_LOCAL_MACHINE, rest.to_string()));
    }
    Err(format!("unsupported registry location: {location}"))
}

fn toggle_startup_folder(entry: &StartupEntry, enabled: bool) -> Result<String, String> {
    let path = PathBuf::from(&entry.location);
    if enabled {
        // location is the .disabled path or original; try rename .lnk.disabled -> .lnk
        if path.extension().and_then(|e| e.to_str()) == Some("disabled") {
            let target = path.with_extension("");
            fs::rename(&path, &target).map_err(|e| format!("rename: {e}"))?;
            return Ok(format!("Enabled startup shortcut {}", target.display()));
        }
        if let Some(cmd) = &entry.command {
            let p = PathBuf::from(cmd);
            if p.exists() {
                return Ok("Already enabled".into());
            }
            let disabled = PathBuf::from(format!("{}.disabled", cmd));
            if disabled.exists() {
                fs::rename(&disabled, &p).map_err(|e| format!("rename: {e}"))?;
                return Ok(format!("Enabled startup shortcut {}", p.display()));
            }
        }
        Err("could not find disabled shortcut to restore".into())
    } else {
        let src = if path.exists() {
            path.clone()
        } else if let Some(cmd) = &entry.command {
            PathBuf::from(cmd)
        } else {
            return Err("shortcut path missing".into());
        };
        if !src.exists() {
            return Err(format!("not found: {}", src.display()));
        }
        let dest = PathBuf::from(format!("{}.disabled", src.display()));
        fs::rename(&src, &dest).map_err(|e| format!("rename: {e}"))?;
        Ok(format!("Disabled startup shortcut → {}", dest.display()))
    }
}

fn toggle_task(entry: &StartupEntry, enabled: bool) -> Result<String, String> {
    let flag = if enabled { "/ENABLE" } else { "/DISABLE" };
    let task_name = entry
        .command
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or(&entry.name);
    let output = crate::process_win::silent_command("schtasks")
        .args(["/Change", "/TN", task_name, flag])
        .output()
        .map_err(|e| format!("schtasks: {e}"))?;
    if output.status.success() {
        Ok(format!(
            "{} scheduled task '{task_name}'",
            if enabled { "Enabled" } else { "Disabled" }
        ))
    } else {
        let err = String::from_utf8_lossy(&output.stderr);
        Err(format!("schtasks failed: {err}"))
    }
}

fn toggle_service(entry: &StartupEntry, enabled: bool) -> Result<String, String> {
    if is_protected_service(&entry.name) {
        return Err(format!(
            "refusing to change protected system service '{}'",
            entry.name
        ));
    }
    let start_type = if enabled { "demand" } else { "disabled" };
    let output = crate::process_win::silent_command("sc")
        .args(["config", &entry.name, &format!("start={start_type}")])
        .output()
        .map_err(|e| format!("sc: {e}"))?;
    // sc writes to stdout oddly; check status.
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if output.status.success() || stdout.to_lowercase().contains("success") {
        Ok(format!(
            "Set service '{}' start={start_type}",
            entry.name
        ))
    } else {
        Err(format!("sc config failed: {stdout} {stderr}"))
    }
}

fn is_protected_service(name: &str) -> bool {
    const PROTECTED: &[&str] = &[
        "RpcSs",
        "DcomLaunch",
        "LSM",
        "EventLog",
        "PlugPlay",
        "Power",
        "SamSs",
        "Schedule",
        "Winmgmt",
        "CryptSvc",
        "BFE",
        "mpssvc",
        "Wuauserv",
        "WinDefend",
        "SecurityHealthService",
        "SystemEventsBroker",
        "StateRepository",
        "BrokerInfrastructure",
        "CoreMessagingRegistrar",
        "camsvc",
        "gpsvc",
        "ProfSvc",
        "UserManager",
        "Themes",
        "AudioSrv",
        "AudioEndpointBuilder",
        "Dhcp",
        "Dnscache",
        "NlaSvc",
        "nsi",
        "LanmanServer",
        "LanmanWorkstation",
        "Wcmsvc",
        "netprofm",
    ];
    let n = name.to_ascii_lowercase();
    PROTECTED
        .iter()
        .any(|p| p.eq_ignore_ascii_case(name) || n == p.to_ascii_lowercase())
}

#[cfg(windows)]
fn collect_run_keys(out: &mut Vec<StartupEntry>) {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    const PATHS: &[(&str, isize, &str, &str)] = &[
        (
            "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",
            HKEY_CURRENT_USER,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
            "user",
        ),
        (
            "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
            "machine",
        ),
        (
            "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce",
            HKEY_CURRENT_USER,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce",
            "user",
        ),
        (
            "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce",
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce",
            "machine",
        ),
        (
            "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run",
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run",
            "machine",
        ),
        (
            "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnceEx",
            HKEY_CURRENT_USER,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnceEx",
            "user",
        ),
        (
            "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnceEx",
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnceEx",
            "machine",
        ),
        (
            "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer\\Run",
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer\Run",
            "machine",
        ),
        (
            "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer\\Run",
            HKEY_CURRENT_USER,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer\Run",
            "user",
        ),
    ];

    for (location, hive, sub, scope) in PATHS {
        let root = RegKey::predef(*hive);
        let key = match root.open_subkey_with_flags(sub, KEY_READ) {
            Ok(k) => k,
            Err(_) => continue,
        };
        let category = if sub.ends_with("RunOnce") {
            "run_once"
        } else {
            "run_key"
        };
        for (name, value) in key.enum_values().flatten() {
            let name = name.trim().to_string();
            if name.is_empty() || name.ends_with(".DeviceLifelineDisabled") {
                continue;
            }
            let cmd = value.to_string();
            out.push(StartupEntry {
                id: format!("run:{location}:{name}"),
                category: category.into(),
                name: name.clone(),
                command: Some(cmd.trim().to_string()),
                location: (*location).into(),
                enabled: true,
                scope: (*scope).into(),
                publisher: None,
                can_toggle: true,
            });
        }
        // Disabled-by-us entries
        for (name, value) in key.enum_values().flatten() {
            if let Some(orig) = name.strip_suffix(".DeviceLifelineDisabled") {
                out.push(StartupEntry {
                    id: format!("run:{location}:{orig}"),
                    category: category.into(),
                    name: orig.to_string(),
                    command: Some(value.to_string().trim().to_string()),
                    location: (*location).into(),
                    enabled: false,
                    scope: (*scope).into(),
                    publisher: None,
                    can_toggle: true,
                });
            }
        }
    }
}

#[cfg(windows)]
fn collect_startup_folders(out: &mut Vec<StartupEntry>) {
    let mut dirs: Vec<(PathBuf, &str)> = Vec::new();
    if let Some(appdata) = std::env::var_os("APPDATA") {
        dirs.push((
            PathBuf::from(appdata).join(r"Microsoft\Windows\Start Menu\Programs\Startup"),
            "user",
        ));
    }
    if let Some(progdata) = std::env::var_os("ProgramData") {
        dirs.push((
            PathBuf::from(progdata).join(r"Microsoft\Windows\Start Menu\Programs\StartUp"),
            "machine",
        ));
    }
    for (dir, scope) in dirs {
        if !dir.is_dir() {
            continue;
        }
        let rd = match fs::read_dir(&dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for entry in rd.flatten() {
            let path = entry.path();
            let fname = entry.file_name().to_string_lossy().to_string();
            if fname.eq_ignore_ascii_case("desktop.ini") {
                continue;
            }
            let disabled = fname.ends_with(".disabled");
            let name = if disabled {
                fname.trim_end_matches(".disabled").to_string()
            } else {
                fname
            };
            out.push(StartupEntry {
                id: format!("folder:{}:{}", dir.display(), name),
                category: "startup_folder".into(),
                name,
                command: Some(path.display().to_string()),
                location: path.display().to_string(),
                enabled: !disabled,
                scope: scope.into(),
                publisher: None,
                can_toggle: true,
            });
        }
    }
}

#[cfg(windows)]
fn collect_tasks(out: &mut Vec<StartupEntry>) {
    // Full task inventory (Autoruns includes Microsoft tasks; we keep them).
    let script = r#"
$ErrorActionPreference='SilentlyContinue'
Get-ScheduledTask | Where-Object { $_.TaskName } | Select-Object -First 800 | ForEach-Object {
  [pscustomobject]@{
    name = $_.TaskName
    path = $_.TaskPath
    state = [string]$_.State
    enabled = ($_.Settings.Enabled -eq $true)
  }
} | ConvertTo-Json -Compress
"#;
    let output = crate::process_win::silent_command("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output();
    let Ok(output) = output else {
        return;
    };
    if !output.status.success() {
        return;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return;
    }
    let value: serde_json::Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => return,
    };
    let arr = if value.is_array() {
        value.as_array().cloned().unwrap_or_default()
    } else {
        vec![value]
    };
    for v in arr {
        let name = v
            .get("name")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        if name.is_empty() {
            continue;
        }
        let path = v
            .get("path")
            .and_then(|x| x.as_str())
            .unwrap_or("\\")
            .to_string();
        let full = format!("{path}{name}");
        let enabled = v.get("enabled").and_then(|x| x.as_bool()).unwrap_or(true);
        out.push(StartupEntry {
            id: format!("task:{full}"),
            category: "scheduled_task".into(),
            name: name.clone(),
            command: Some(full.clone()),
            location: full,
            enabled,
            scope: "machine".into(),
            publisher: None,
            can_toggle: true,
        });
    }
}

#[cfg(windows)]
fn collect_services_live(out: &mut Vec<StartupEntry>) {
    // Full service inventory (Autoruns lists all); protected ones are read-only.
    let script = r#"
$ErrorActionPreference='SilentlyContinue'
Get-CimInstance Win32_Service | Select-Object -First 500 Name, DisplayName, StartMode, State, PathName | ForEach-Object {
  [pscustomobject]@{
    name = $_.Name
    display = $_.DisplayName
    start = $_.StartMode
    state = $_.State
    path = $_.PathName
  }
} | ConvertTo-Json -Compress
"#;
    let output = crate::process_win::silent_command("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output();
    let Ok(output) = output else {
        return;
    };
    if !output.status.success() {
        return;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return;
    }
    let value: serde_json::Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => return,
    };
    let arr = if value.is_array() {
        value.as_array().cloned().unwrap_or_default()
    } else {
        vec![value]
    };
    for v in arr {
        let name = v
            .get("name")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        if name.is_empty() || is_protected_service(&name) {
            continue;
        }
        let display = v
            .get("display")
            .and_then(|x| x.as_str())
            .unwrap_or(&name)
            .to_string();
        let start = v
            .get("start")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let enabled = !start.eq_ignore_ascii_case("Disabled");
        let protected = is_protected_service(&name);
        out.push(StartupEntry {
            id: format!("service:{name}"),
            category: "service".into(),
            name: name.clone(),
            command: v
                .get("path")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            location: format!("Service · {display} · {start}"),
            enabled,
            scope: "machine".into(),
            publisher: None,
            can_toggle: !protected,
        });
    }
}

/// Kernel drivers (Autoruns Drivers tab).
#[cfg(windows)]
fn collect_kernel_drivers(out: &mut Vec<StartupEntry>) {
    use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    const SERVICES: &str = r"SYSTEM\CurrentControlSet\Services";
    let root = RegKey::predef(HKEY_LOCAL_MACHINE);
    let services = match root.open_subkey_with_flags(SERVICES, KEY_READ) {
        Ok(s) => s,
        Err(_) => return,
    };
    for subkey_name in services.enum_keys().flatten() {
        let entry = match services.open_subkey_with_flags(&subkey_name, KEY_READ) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let service_type: u32 = match entry.get_value("Type") {
            Ok(v) => v,
            Err(_) => continue,
        };
        // Kernel driver 1, file system 2
        if service_type != 1 && service_type != 2 {
            continue;
        }
        let start: u32 = entry.get_value("Start").unwrap_or(3);
        let image: String = entry.get_value("ImagePath").unwrap_or_default();
        let display: String = entry
            .get_value("DisplayName")
            .unwrap_or_else(|_| subkey_name.clone());
        let enabled = start != 4; // 4 = disabled
        out.push(StartupEntry {
            id: format!("driver:{subkey_name}"),
            category: "driver".into(),
            name: display,
            command: if image.is_empty() { None } else { Some(image) },
            location: format!(r"HKLM\SYSTEM\CurrentControlSet\Services\{subkey_name}"),
            enabled,
            scope: "machine".into(),
            publisher: None,
            can_toggle: !is_protected_service(&subkey_name),
        });
    }
}

/// Winlogon, AppInit, IFEO, BootExecute, KnownDLLs, LSA, Winsock, codecs, etc.
#[cfg(windows)]
fn collect_registry_value_entries(out: &mut Vec<StartupEntry>) {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    struct Spec {
        location: &'static str,
        hive: isize,
        sub: &'static str,
        category: &'static str,
        scope: &'static str,
        /// If set, only this value name is collected (multi-sz / string).
        only_value: Option<&'static str>,
    }

    const SPECS: &[Spec] = &[
        Spec {
            location: r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon",
            hive: HKEY_LOCAL_MACHINE,
            sub: r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon",
            category: "winlogon",
            scope: "machine",
            only_value: None,
        },
        Spec {
            location: r"HKCU\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon",
            hive: HKEY_CURRENT_USER,
            sub: r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon",
            category: "winlogon",
            scope: "user",
            only_value: None,
        },
        Spec {
            location: r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Windows",
            hive: HKEY_LOCAL_MACHINE,
            sub: r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Windows",
            category: "appinit",
            scope: "machine",
            only_value: Some("AppInit_DLLs"),
        },
        Spec {
            location: r"HKLM\SOFTWARE\Wow6432Node\Microsoft\Windows NT\CurrentVersion\Windows",
            hive: HKEY_LOCAL_MACHINE,
            sub: r"SOFTWARE\Wow6432Node\Microsoft\Windows NT\CurrentVersion\Windows",
            category: "appinit",
            scope: "machine",
            only_value: Some("AppInit_DLLs"),
        },
        Spec {
            location: r"HKLM\SYSTEM\CurrentControlSet\Control\Session Manager",
            hive: HKEY_LOCAL_MACHINE,
            sub: r"SYSTEM\CurrentControlSet\Control\Session Manager",
            category: "boot_execute",
            scope: "machine",
            only_value: Some("BootExecute"),
        },
        Spec {
            location: r"HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\KnownDLLs",
            hive: HKEY_LOCAL_MACHINE,
            sub: r"SYSTEM\CurrentControlSet\Control\Session Manager\KnownDLLs",
            category: "knowndlls",
            scope: "machine",
            only_value: None,
        },
        Spec {
            location: r"HKLM\SYSTEM\CurrentControlSet\Control\Lsa",
            hive: HKEY_LOCAL_MACHINE,
            sub: r"SYSTEM\CurrentControlSet\Control\Lsa",
            category: "lsa",
            scope: "machine",
            only_value: Some("Authentication Packages"),
        },
        Spec {
            location: r"HKLM\SYSTEM\CurrentControlSet\Control\Print\Monitors",
            hive: HKEY_LOCAL_MACHINE,
            sub: r"SYSTEM\CurrentControlSet\Control\Print\Monitors",
            category: "print_monitor",
            scope: "machine",
            only_value: None,
        },
        Spec {
            location: r"HKLM\SYSTEM\CurrentControlSet\Control\NetworkProvider\Order",
            hive: HKEY_LOCAL_MACHINE,
            sub: r"SYSTEM\CurrentControlSet\Control\NetworkProvider\Order",
            category: "network_provider",
            scope: "machine",
            only_value: Some("ProviderOrder"),
        },
        Spec {
            location: r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options",
            hive: HKEY_LOCAL_MACHINE,
            sub: r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options",
            category: "image_hijack",
            scope: "machine",
            only_value: None,
        },
    ];

    for spec in SPECS {
        let root = RegKey::predef(spec.hive);
        if spec.category == "image_hijack" {
            // Enumerate IFEO subkeys for Debugger hijacks
            let key = match root.open_subkey_with_flags(spec.sub, KEY_READ) {
                Ok(k) => k,
                Err(_) => continue,
            };
            for sub in key.enum_keys().flatten().take(200) {
                if let Ok(child) = key.open_subkey_with_flags(&sub, KEY_READ) {
                    if let Ok(debugger) = child.get_value::<String, _>("Debugger") {
                        if !debugger.trim().is_empty() {
                            out.push(StartupEntry {
                                id: format!("ifeo:{sub}"),
                                category: "image_hijack".into(),
                                name: sub.clone(),
                                command: Some(debugger),
                                location: format!("{}\\{}", spec.location, sub),
                                enabled: true,
                                scope: spec.scope.into(),
                                publisher: None,
                                can_toggle: true,
                            });
                        }
                    }
                }
            }
            continue;
        }
        if spec.category == "print_monitor" {
            let key = match root.open_subkey_with_flags(spec.sub, KEY_READ) {
                Ok(k) => k,
                Err(_) => continue,
            };
            for sub in key.enum_keys().flatten().take(100) {
                if let Ok(child) = key.open_subkey_with_flags(&sub, KEY_READ) {
                    let driver: String = child.get_value("Driver").unwrap_or_default();
                    out.push(StartupEntry {
                        id: format!("print:{sub}"),
                        category: "print_monitor".into(),
                        name: sub.clone(),
                        command: if driver.is_empty() {
                            None
                        } else {
                            Some(driver)
                        },
                        location: format!("{}\\{}", spec.location, sub),
                        enabled: true,
                        scope: "machine".into(),
                        publisher: None,
                        can_toggle: false, // structural — show only
                    });
                }
            }
            continue;
        }

        let key = match root.open_subkey_with_flags(spec.sub, KEY_READ) {
            Ok(k) => k,
            Err(_) => continue,
        };
        if let Some(only) = spec.only_value {
            if let Ok(val) = key.get_value::<String, _>(only) {
                if !val.trim().is_empty() {
                    out.push(StartupEntry {
                        id: format!("reg:{}:{only}", spec.location),
                        category: spec.category.into(),
                        name: only.into(),
                        command: Some(val),
                        location: spec.location.into(),
                        enabled: true,
                        scope: spec.scope.into(),
                        publisher: None,
                        can_toggle: matches!(
                            spec.category,
                            "appinit" | "boot_execute" | "winlogon"
                        ),
                    });
                }
            } else if let Ok(vals) = key.get_value::<Vec<String>, _>(only) {
                let joined = vals.join(" ");
                if !joined.trim().is_empty() {
                    out.push(StartupEntry {
                        id: format!("reg:{}:{only}", spec.location),
                        category: spec.category.into(),
                        name: only.into(),
                        command: Some(joined),
                        location: spec.location.into(),
                        enabled: true,
                        scope: spec.scope.into(),
                        publisher: None,
                        can_toggle: matches!(spec.category, "boot_execute"),
                    });
                }
            }
        } else if spec.category == "winlogon" {
            for name in ["Userinit", "Shell", "Notify", "Taskman", "VmApplet"] {
                if let Ok(val) = key.get_value::<String, _>(name) {
                    if val.trim().is_empty() {
                        continue;
                    }
                    out.push(StartupEntry {
                        id: format!("winlogon:{}:{name}", spec.scope),
                        category: "winlogon".into(),
                        name: name.into(),
                        command: Some(val),
                        location: spec.location.into(),
                        enabled: true,
                        scope: spec.scope.into(),
                        publisher: None,
                        can_toggle: name != "Userinit" && name != "Shell", // protect critical
                    });
                }
            }
        } else if spec.category == "knowndlls" {
            for (name, value) in key.enum_values().flatten().take(80) {
                out.push(StartupEntry {
                    id: format!("knowndll:{name}"),
                    category: "knowndlls".into(),
                    name,
                    command: Some(value.to_string()),
                    location: spec.location.into(),
                    enabled: true,
                    scope: "machine".into(),
                    publisher: None,
                    can_toggle: false,
                });
            }
        }
    }

    // Winsock catalog (LSP) — names only
    if let Ok(key) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey_with_flags(
        r"SYSTEM\CurrentControlSet\Services\WinSock2\Parameters\Protocol_Catalog9\Catalog_Entries",
        KEY_READ,
    ) {
        for sub in key.enum_keys().flatten().take(64) {
            out.push(StartupEntry {
                id: format!("winsock:{sub}"),
                category: "winsock".into(),
                name: format!("Winsock catalog {sub}"),
                command: None,
                location: format!(
                    r"HKLM\SYSTEM\CurrentControlSet\Services\WinSock2\Parameters\Protocol_Catalog9\Catalog_Entries\{sub}"
                ),
                enabled: true,
                scope: "machine".into(),
                publisher: None,
                can_toggle: false,
            });
        }
    }

    // Codecs
    for (loc, sub) in [
        (
            r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Drivers32",
            r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Drivers32",
        ),
        (
            r"HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows NT\CurrentVersion\Drivers32",
            r"SOFTWARE\WOW6432Node\Microsoft\Windows NT\CurrentVersion\Drivers32",
        ),
    ] {
        if let Ok(key) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey_with_flags(sub, KEY_READ) {
            for (name, value) in key.enum_values().flatten().take(100) {
                out.push(StartupEntry {
                    id: format!("codec:{loc}:{name}"),
                    category: "codec".into(),
                    name: name.clone(),
                    command: Some(value.to_string()),
                    location: loc.into(),
                    enabled: true,
                    scope: "machine".into(),
                    publisher: None,
                    can_toggle: true,
                });
            }
        }
    }
}

/// Browser Helper Objects + Explorer shell execute hooks.
#[cfg(windows)]
fn collect_bho_and_shell(out: &mut Vec<StartupEntry>) {
    use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    // BHOs
    for sub in [
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Browser Helper Objects",
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Explorer\Browser Helper Objects",
    ] {
        if let Ok(key) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey_with_flags(sub, KEY_READ) {
            for clsid in key.enum_keys().flatten().take(80) {
                out.push(StartupEntry {
                    id: format!("bho:{clsid}"),
                    category: "internet_explorer".into(),
                    name: clsid.clone(),
                    command: None,
                    location: format!(r"HKLM\{sub}\{clsid}"),
                    enabled: true,
                    scope: "machine".into(),
                    publisher: None,
                    can_toggle: false,
                });
            }
        }
    }

    // ShellExecuteHooks
    if let Ok(key) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey_with_flags(
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\ShellExecuteHooks",
        KEY_READ,
    ) {
        for (name, value) in key.enum_values().flatten().take(40) {
            out.push(StartupEntry {
                id: format!("shellhook:{name}"),
                category: "explorer".into(),
                name,
                command: Some(value.to_string()),
                location: r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\ShellExecuteHooks"
                    .into(),
                enabled: true,
                scope: "machine".into(),
                publisher: None,
                can_toggle: true,
            });
        }
    }
}

/// WMI event consumers (Autoruns WMI tab) — inventory only.
#[cfg(windows)]
fn collect_wmi_persistence(out: &mut Vec<StartupEntry>) {
    let script = r#"
$ErrorActionPreference='SilentlyContinue'
$items = @()
try {
  Get-WmiObject -Namespace root\subscription -Class __EventFilter -EA SilentlyContinue | Select-Object -First 40 | ForEach-Object {
    $items += [pscustomobject]@{ name=$_.Name; query=$_.Query; kind='filter' }
  }
  Get-WmiObject -Namespace root\subscription -Class CommandLineEventConsumer -EA SilentlyContinue | Select-Object -First 40 | ForEach-Object {
    $items += [pscustomobject]@{ name=$_.Name; query=$_.CommandLineTemplate; kind='consumer' }
  }
} catch {}
$items | ConvertTo-Json -Compress
"#;
    let output = crate::process_win::silent_command("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output();
    let Ok(output) = output else {
        return;
    };
    let text = String::from_utf8_lossy(&output.stdout);
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return;
    }
    let value: serde_json::Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => return,
    };
    let arr = if value.is_array() {
        value.as_array().cloned().unwrap_or_default()
    } else {
        vec![value]
    };
    for v in arr {
        let name = v
            .get("name")
            .and_then(|x| x.as_str())
            .unwrap_or("wmi")
            .to_string();
        let cmd = v.get("query").and_then(|x| x.as_str()).map(|s| s.into());
        let kind = v.get("kind").and_then(|x| x.as_str()).unwrap_or("wmi");
        out.push(StartupEntry {
            id: format!("wmi:{kind}:{name}"),
            category: "wmi".into(),
            name: format!("{kind}: {name}"),
            command: cmd,
            location: r"root\subscription".into(),
            enabled: true,
            scope: "machine".into(),
            publisher: None,
            can_toggle: false,
        });
    }
}

#[cfg(not(windows))]
fn mock_entries() -> Vec<StartupEntry> {
    vec![
        StartupEntry {
            id: "run:mock:CloudSync".into(),
            category: "run_key".into(),
            name: "CloudSync".into(),
            command: Some(r"C:\Tools\cloudsync.exe".into()),
            location: r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run".into(),
            enabled: true,
            scope: "user".into(),
            publisher: Some("Mock".into()),
            can_toggle: true,
        },
        StartupEntry {
            id: "service:mocksvc".into(),
            category: "service".into(),
            name: "MockSvc".into(),
            command: Some(r"C:\Tools\mocksvc.exe".into()),
            location: "Service · Mock Service".into(),
            enabled: true,
            scope: "machine".into(),
            publisher: None,
            can_toggle: true,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protected_services_blocked() {
        assert!(is_protected_service("RpcSs"));
        assert!(is_protected_service("WinDefend"));
        assert!(!is_protected_service("SomeVendorUpdater"));
    }

    #[test]
    fn list_startup_does_not_panic() {
        let entries = list_startup_entries().expect("list");
        // On Windows may be non-empty; mock path returns 2.
        let _ = entries.len();
    }
}
