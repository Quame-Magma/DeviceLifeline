//! System-configuration collectors.
//!
//! [`WindowsConfigCollector`] reads startup items (Run keys), Win32 services,
//! and scheduled tasks from the Windows registry (compiled only on Windows).
//! [`MockConfigCollector`] returns a fixed set of entries and is always compiled
//! so non-Windows builds and unit tests have a deterministic source.

use crate::error::CollectorError;
use crate::models::RawConfig;

use super::ConfigCollector;

/// Reads system-configuration items from the Windows registry.
///
/// Collection is defensive: a missing key or value is skipped rather than
/// failing the whole collect. It reads, in order:
/// - **startup**: HKLM & HKCU
///   `SOFTWARE\Microsoft\Windows\CurrentVersion\Run`.
/// - **service**: HKLM `SYSTEM\CurrentControlSet\Services`, keeping only Win32
///   services (`Type` DWORD `0x10` or `0x20`).
/// - **scheduled_task**: HKLM
///   `SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\TaskCache\Tasks`.
#[cfg(windows)]
pub struct WindowsConfigCollector;

#[cfg(windows)]
impl WindowsConfigCollector {
    /// Creates a new collector.
    pub fn new() -> Self {
        WindowsConfigCollector
    }
}

#[cfg(windows)]
impl Default for WindowsConfigCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(windows)]
impl ConfigCollector for WindowsConfigCollector {
    fn collect(&self) -> Result<Vec<RawConfig>, CollectorError> {
        let mut items: Vec<RawConfig> = Vec::new();
        collect_startup(&mut items);
        collect_services(&mut items);
        collect_scheduled_tasks(&mut items);
        collect_browser_extensions(&mut items);
        collect_dev_tools(&mut items);
        collect_hardware_basics(&mut items);
        collect_power_settings(&mut items);
        collect_network_adapters(&mut items);
        Ok(items)
    }
}

/// Appends startup entries from the HKLM and HKCU `Run` keys.
#[cfg(windows)]
fn collect_startup(items: &mut Vec<RawConfig>) {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    const RUN: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run";

    for hive in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        let root = RegKey::predef(hive);
        let run = match root.open_subkey_with_flags(RUN, KEY_READ) {
            Ok(key) => key,
            Err(_) => continue,
        };

        for (name, value) in run.enum_values().flatten() {
            let name = name.trim().to_string();
            if name.is_empty() {
                continue;
            }
            let data = value.to_string();
            let path = if data.trim().is_empty() {
                None
            } else {
                Some(data.trim().to_string())
            };

            if should_skip_startup(&name, path.as_deref()) {
                continue;
            }

            items.push(RawConfig {
                kind: "startup".to_string(),
                name,
                status: Some("enabled".to_string()),
                path,
                publisher: None,
                source: "registry".to_string(),
            });
        }
    }
}

/// Appends Win32 service entries from `SYSTEM\CurrentControlSet\Services`.
#[cfg(windows)]
fn collect_services(items: &mut Vec<RawConfig>) {
    use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    const SERVICES: &str = r"SYSTEM\CurrentControlSet\Services";

    let root = RegKey::predef(HKEY_LOCAL_MACHINE);
    let services = match root.open_subkey_with_flags(SERVICES, KEY_READ) {
        Ok(key) => key,
        Err(_) => return,
    };

    for subkey_name in services.enum_keys().flatten() {
        let entry = match services.open_subkey_with_flags(&subkey_name, KEY_READ) {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        // Only Win32 services (own-process 0x10 or share-process 0x20).
        let service_type: u32 = match entry.get_value("Type") {
            Ok(value) => value,
            Err(_) => continue,
        };
        if service_type != 0x10 && service_type != 0x20 {
            continue;
        }

        let name = read_optional(&entry, "DisplayName").unwrap_or_else(|| subkey_name.clone());
        let path = read_optional(&entry, "ImagePath");
        let status = entry.get_value::<u32, _>("Start").ok().map(map_start_mode);

        if should_skip_service(&subkey_name, &name, path.as_deref()) {
            continue;
        }

        items.push(RawConfig {
            kind: "service".to_string(),
            name,
            status,
            path,
            publisher: None,
            source: "registry".to_string(),
        });
    }
}

/// Maps a service `Start` DWORD to a human-readable status string.
#[cfg(windows)]
fn map_start_mode(start: u32) -> String {
    match start {
        0 => "boot",
        1 => "system",
        2 => "automatic",
        3 => "manual",
        4 => "disabled",
        _ => "unknown",
    }
    .to_string()
}

/// Appends scheduled-task entries from the registry `TaskCache\Tasks` tree.
#[cfg(windows)]
fn collect_scheduled_tasks(items: &mut Vec<RawConfig>) {
    use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    const TASKS: &str = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\TaskCache\Tasks";

    let root = RegKey::predef(HKEY_LOCAL_MACHINE);
    let tasks = match root.open_subkey_with_flags(TASKS, KEY_READ) {
        Ok(key) => key,
        Err(_) => return,
    };

    for guid in tasks.enum_keys().flatten() {
        let task = match tasks.open_subkey_with_flags(&guid, KEY_READ) {
            Ok(task) => task,
            Err(_) => continue,
        };

        // The `Path` value names the task; skip GUIDs lacking it.
        let path = match read_optional(&task, "Path") {
            Some(path) => path,
            None => continue,
        };

        if should_skip_scheduled_task(&path) {
            continue;
        }

        items.push(RawConfig {
            kind: "scheduled_task".to_string(),
            name: path,
            status: None,
            path: None,
            publisher: None,
            source: "registry".to_string(),
        });
    }
}

/// Appends Chromium-family browser extensions without reading browser history.
#[cfg(windows)]
fn collect_browser_extensions(items: &mut Vec<RawConfig>) {
    use std::collections::HashSet;
    use std::path::{Path, PathBuf};

    let local_app_data = match std::env::var_os("LOCALAPPDATA") {
        Some(path) => PathBuf::from(path),
        None => return,
    };

    let browsers = [
        ("Chrome", local_app_data.join(r"Google\Chrome\User Data")),
        ("Edge", local_app_data.join(r"Microsoft\Edge\User Data")),
        (
            "Brave",
            local_app_data.join(r"BraveSoftware\Brave-Browser\User Data"),
        ),
    ];

    let mut seen_extensions: HashSet<(String, String)> = HashSet::new();

    for (browser, user_data_dir) in browsers {
        let profiles = browser_profiles(&user_data_dir);
        for profile in profiles {
            let extensions_dir = profile.join("Extensions");
            let profile_name = profile
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("profile")
                .to_string();

            let extension_ids = match std::fs::read_dir(&extensions_dir) {
                Ok(entries) => entries,
                Err(_) => continue,
            };

            for entry in extension_ids.flatten() {
                let extension_dir = entry.path();
                if !extension_dir.is_dir() {
                    continue;
                }

                let extension_id = match extension_dir.file_name().and_then(|name| name.to_str()) {
                    Some(id) if is_chromium_extension_id(id) => id.to_string(),
                    _ => continue,
                };
                if is_builtin_chromium_extension_id(&extension_id) {
                    continue;
                }

                let Some((display_name, version)) = extension_manifest_summary(&extension_dir)
                else {
                    continue;
                };
                if should_skip_extension_name(&extension_id, &display_name) {
                    continue;
                }

                let dedupe_key = (browser.to_string(), extension_id.clone());
                if !seen_extensions.insert(dedupe_key) {
                    continue;
                }

                items.push(RawConfig {
                    kind: "browser_extension".to_string(),
                    name: format!("{browser}: {display_name}"),
                    status: Some(profile_name.clone()),
                    path: Some(match version {
                        Some(version) => format!("{extension_id} @ {version}"),
                        None => extension_id,
                    }),
                    publisher: None,
                    source: "browser".to_string(),
                });
            }
        }
    }

    fn browser_profiles(user_data_dir: &Path) -> Vec<PathBuf> {
        let entries = match std::fs::read_dir(user_data_dir) {
            Ok(entries) => entries,
            Err(_) => return Vec::new(),
        };

        entries
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| path.is_dir() && path.join("Extensions").is_dir())
            .collect()
    }

    fn extension_manifest_summary(extension_dir: &Path) -> Option<(String, Option<String>)> {
        let mut versions: Vec<PathBuf> = std::fs::read_dir(extension_dir)
            .ok()?
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| path.is_dir() && path.join("manifest.json").is_file())
            .collect();
        versions.sort();
        let manifest_path = versions.pop()?.join("manifest.json");
        let value: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&manifest_path).ok()?).ok()?;
        let name = resolve_localized_name(&manifest_path, &value);
        let version = value
            .get("version")
            .and_then(|version| version.as_str())
            .map(str::trim)
            .filter(|version| !version.is_empty())
            .map(str::to_string);
        name.map(|name| (name, version))
    }

    fn is_chromium_extension_id(value: &str) -> bool {
        value.len() == 32 && value.bytes().all(|byte| matches!(byte, b'a'..=b'p'))
    }

    fn should_skip_extension_name(extension_id: &str, display_name: &str) -> bool {
        let trimmed = display_name.trim();
        trimmed.is_empty()
            || trimmed.eq_ignore_ascii_case("temp")
            || trimmed.eq_ignore_ascii_case(extension_id)
            || is_chromium_extension_id(trimmed)
    }

    fn is_builtin_chromium_extension_id(extension_id: &str) -> bool {
        matches!(
            extension_id,
            "ghbmnnjooekpmoecnnnilnnbdlolhkhi" | "nmmhkkegccagdldgiimedpiccmgmieda"
        )
    }

    fn resolve_localized_name(
        manifest_path: &Path,
        manifest: &serde_json::Value,
    ) -> Option<String> {
        let raw_name = manifest.get("name")?.as_str()?.trim();
        if !raw_name.starts_with("__MSG_") {
            return Some(raw_name.to_string());
        }

        let key = raw_name
            .strip_prefix("__MSG_")?
            .strip_suffix("__")?
            .to_string();
        let version_dir = manifest_path.parent()?;
        let locales_dir = version_dir.join("_locales");
        let default_locale = manifest
            .get("default_locale")
            .and_then(|locale| locale.as_str())
            .map(str::trim)
            .filter(|locale| !locale.is_empty());

        if let Some(default_locale) = default_locale {
            if let Some(name) = read_locale_message(&locales_dir.join(default_locale), &key) {
                return Some(name);
            }
        }

        let locales = std::fs::read_dir(locales_dir).ok()?;
        locales
            .flatten()
            .filter(|entry| entry.path().is_dir())
            .find_map(|entry| read_locale_message(&entry.path(), &key))
    }

    fn read_locale_message(locale_dir: &Path, key: &str) -> Option<String> {
        let value: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(locale_dir.join("messages.json")).ok()?)
                .ok()?;
        value
            .get(key)
            .and_then(|message| message.get("message"))
            .and_then(|message| message.as_str())
            .map(str::trim)
            .filter(|message| !message.is_empty())
            .map(str::to_string)
    }
}

/// Appends common developer tools discovered on PATH.
#[cfg(windows)]
fn collect_dev_tools(items: &mut Vec<RawConfig>) {
    let tools = [
        ("Git", "git.exe"),
        ("Node.js", "node.exe"),
        ("npm", "npm.cmd"),
        ("pnpm", "pnpm.cmd"),
        ("Python", "python.exe"),
        ("Cargo", "cargo.exe"),
        ("Docker CLI", "docker.exe"),
        ("Visual Studio Code", "code.cmd"),
    ];

    for (name, command) in tools {
        if let Some(path) = first_where_result(command) {
            items.push(RawConfig {
                kind: "dev_tool".to_string(),
                name: name.to_string(),
                status: Some("detected".to_string()),
                path: Some(path),
                publisher: None,
                source: "path".to_string(),
            });
        }
    }
}

#[cfg(windows)]
fn first_where_result(command: &str) -> Option<String> {
    let output = crate::process_win::silent_command("where.exe")
        .arg(command)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !is_windows_apps_alias(line))
        .map(str::to_string)
}

/// Appends coarse hardware identity without collecting serial numbers.
#[cfg(windows)]
fn collect_hardware_basics(items: &mut Vec<RawConfig>) {
    use sysinfo::System;

    let mut system = System::new_all();
    system.refresh_all();

    if let Some(cpu) = system.cpus().first() {
        let brand = cpu.brand().trim();
        if !brand.is_empty() {
            items.push(RawConfig {
                kind: "hardware".to_string(),
                name: "CPU".to_string(),
                status: Some(format!("{} logical cores", system.cpus().len())),
                path: Some(brand.to_string()),
                publisher: None,
                source: "sysinfo".to_string(),
            });
        }
    }

    let total_memory = system.total_memory();
    if total_memory > 0 {
        items.push(RawConfig {
            kind: "hardware".to_string(),
            name: "Memory".to_string(),
            status: Some(format_gib(total_memory)),
            path: None,
            publisher: None,
            source: "sysinfo".to_string(),
        });
    }
}

#[cfg(windows)]
fn format_gib(bytes: u64) -> String {
    let gib = bytes as f64 / 1024.0 / 1024.0 / 1024.0;
    format!("{gib:.1} GiB")
}

/// Appends the active Windows power plan.
#[cfg(windows)]
fn collect_power_settings(items: &mut Vec<RawConfig>) {
    let output = match crate::process_win::silent_command("powercfg")
        .arg("/GETACTIVESCHEME")
        .output()
    {
        Ok(output) if output.status.success() => output,
        _ => return,
    };
    let line = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string);
    let Some(line) = line else {
        return;
    };
    let plan_name = line
        .split_once('(')
        .and_then(|(_, rest)| {
            rest.split_once(')')
                .map(|(name, _)| name.trim().to_string())
        })
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Active scheme".to_string());
    let guid = line
        .split_whitespace()
        .find(|part| part.len() == 36 && part.chars().filter(|ch| *ch == '-').count() == 4)
        .map(str::to_string);

    items.push(RawConfig {
        kind: "power".to_string(),
        name: "Active power plan".to_string(),
        status: Some(plan_name),
        path: guid,
        publisher: None,
        source: "powercfg".to_string(),
    });
}

#[cfg(windows)]
#[derive(serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct NetAdapter {
    name: Option<String>,
    interface_description: Option<String>,
    status: Option<String>,
    link_speed: Option<String>,
}

/// Appends active network adapters.
#[cfg(windows)]
fn collect_network_adapters(items: &mut Vec<RawConfig>) {
    let output = match crate::process_win::silent_command("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "Get-NetAdapter | Where-Object {$_.Status -eq 'Up'} | Select-Object Name,InterfaceDescription,Status,LinkSpeed | ConvertTo-Json -Compress -Depth 2",
        ])
        .output()
    {
        Ok(output) if output.status.success() => output,
        _ => return,
    };

    let json = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if json.is_empty() {
        return;
    }

    for adapter in parse_network_adapters(&json) {
        let name = match adapter.name.and_then(non_empty) {
            Some(name) => name,
            None => continue,
        };
        let interface_description = adapter.interface_description.and_then(non_empty);
        if should_skip_network_adapter(&name, interface_description.as_deref()) {
            continue;
        }

        let status = match (
            adapter.status.and_then(non_empty),
            adapter.link_speed.and_then(non_empty),
        ) {
            (Some(status), Some(speed)) => Some(format!("{status} · {speed}")),
            (Some(status), None) => Some(status),
            (None, Some(speed)) => Some(speed),
            (None, None) => None,
        };

        items.push(RawConfig {
            kind: "network".to_string(),
            name,
            status,
            path: interface_description,
            publisher: None,
            source: "powershell".to_string(),
        });
    }
}

#[cfg(windows)]
fn parse_network_adapters(json: &str) -> Vec<NetAdapter> {
    let value = match serde_json::from_str::<serde_json::Value>(json) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };

    if value.is_array() {
        serde_json::from_value::<Vec<NetAdapter>>(value).unwrap_or_default()
    } else {
        serde_json::from_value::<NetAdapter>(value)
            .map(|adapter| vec![adapter])
            .unwrap_or_default()
    }
}

#[cfg(windows)]
fn non_empty(value: String) -> Option<String> {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

#[cfg(any(windows, test))]
fn should_skip_startup(name: &str, path: Option<&str>) -> bool {
    let name_l = normalized(name);
    let path_l = path.map(normalized).unwrap_or_default();
    name_l == "securityhealth"
        || name_l.starts_with("microsoftedgeautolaunch")
        || is_windows_system_path(&path_l)
}

#[cfg(any(windows, test))]
fn should_skip_service(service_name: &str, display_name: &str, image_path: Option<&str>) -> bool {
    let path_l = image_path.map(normalized).unwrap_or_default();
    if is_windows_system_path(&path_l) {
        return true;
    }

    let service_l = normalized(service_name);
    let display_l = normalized(display_name);
    if display_l.starts_with('@') {
        return true;
    }

    service_l.starts_with("windows ")
        || display_l.starts_with("windows ")
        || display_l.contains("windows update")
        || display_l.contains(" update service")
        || display_l.contains(" updater")
        || display_l.contains("elevation service")
        || display_l.contains("genuine software")
}

#[cfg(any(windows, test))]
fn should_skip_scheduled_task(path: &str) -> bool {
    normalized(path).starts_with(r"\microsoft\windows\")
}

#[cfg(any(windows, test))]
fn is_windows_system_path(path_l: &str) -> bool {
    path_l.contains(r":\windows\system32\")
        || path_l.contains(r":\windows\syswow64\")
        || path_l.contains(r":\windows\winsxs\")
        || path_l.contains(r":\windows\servicing\")
        || path_l.contains(r":\windows\microsoft.net\")
        || path_l.contains(r":\windows\systemapps\")
        || path_l.contains(r"%systemroot%\system32\")
        || path_l.contains(r"%systemroot%\servicing\")
        || path_l.contains(r"%systemroot%\microsoft.net\")
        || path_l.contains(r"%windir%\system32\")
        || path_l.contains(r"%programfiles%\windows defender\")
        || path_l.contains(r"%programdata%\microsoft\windows defender\")
        || path_l.contains(r":\programdata\microsoft\windows defender\")
        || path_l.contains(r"\systemroot\system32\")
        || path_l.starts_with(r"system32\")
}

#[cfg(any(windows, test))]
fn should_skip_network_adapter(name: &str, interface_description: Option<&str>) -> bool {
    let name_l = normalized(name);
    let description_l = interface_description.map(normalized).unwrap_or_default();
    name_l.starts_with("vethernet")
        || name_l.contains("default switch")
        || description_l.contains("hyper-v virtual")
        || description_l.contains("loopback")
}

#[cfg(any(windows, test))]
fn is_windows_apps_alias(path: &str) -> bool {
    normalized(path).contains(r"\microsoft\windowsapps\")
}

#[cfg(any(windows, test))]
fn normalized(value: &str) -> String {
    value.trim().trim_matches('"').to_ascii_lowercase()
}

/// Reads a string registry value, returning `None` when missing or blank.
#[cfg(windows)]
fn read_optional(key: &winreg::RegKey, name: &str) -> Option<String> {
    match key.get_value::<String, _>(name) {
        Ok(value) => {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }
        Err(_) => None,
    }
}

/// A deterministic, cross-platform collector used on non-Windows builds and in
/// tests. Always returns the same broad Device DNA entries with
/// `source = "mock"`.
pub struct MockConfigCollector;

impl MockConfigCollector {
    /// Creates a new mock collector.
    pub fn new() -> Self {
        MockConfigCollector
    }
}

impl Default for MockConfigCollector {
    fn default() -> Self {
        Self::new()
    }
}

impl ConfigCollector for MockConfigCollector {
    fn collect(&self) -> Result<Vec<RawConfig>, CollectorError> {
        let task = |name: &str| RawConfig {
            kind: "scheduled_task".to_string(),
            name: name.to_string(),
            status: None,
            path: None,
            publisher: None,
            source: "mock".to_string(),
        };
        let extra = |kind: &str, name: &str, status: &str, path: &str| RawConfig {
            kind: kind.to_string(),
            name: name.to_string(),
            status: Some(status.to_string()),
            path: Some(path.to_string()),
            publisher: None,
            source: "mock".to_string(),
        };

        Ok(vec![
            task(r"\GoogleUpdateTaskMachineUA"),
            extra(
                "browser_extension",
                "Chrome: React Developer Tools",
                "Default",
                "fmkadmapgofadopljbjfkapdkoienihi @ 5.0.0",
            ),
            extra(
                "dev_tool",
                "Git",
                "detected",
                r"C:\Program Files\Git\cmd\git.exe",
            ),
            extra(
                "dev_tool",
                "Node.js",
                "detected",
                r"C:\Program Files\nodejs\node.exe",
            ),
            extra("hardware", "CPU", "16 logical cores", "Mock CPU"),
            extra("hardware", "Memory", "32.0 GiB", ""),
            extra(
                "power",
                "Active power plan",
                "Balanced",
                "381b4222-f694-41f0-9685-ff5bb260df2e",
            ),
            extra("network", "Wi-Fi", "Up · 866 Mbps", "Mock Wireless Adapter"),
        ])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_collector_returns_items_across_all_local_config_kinds() {
        let collector = MockConfigCollector::new();
        let items = collector.collect().expect("mock collect");
        assert!(items.iter().all(|item| item.source == "mock"));

        let startup = items.iter().filter(|i| i.kind == "startup").count();
        let service = items.iter().filter(|i| i.kind == "service").count();
        let task = items.iter().filter(|i| i.kind == "scheduled_task").count();
        let browser = items
            .iter()
            .filter(|i| i.kind == "browser_extension")
            .count();
        let dev_tool = items.iter().filter(|i| i.kind == "dev_tool").count();
        let hardware = items.iter().filter(|i| i.kind == "hardware").count();
        let power = items.iter().filter(|i| i.kind == "power").count();
        let network = items.iter().filter(|i| i.kind == "network").count();
        assert_eq!(items.len(), 8);
        assert_eq!(startup, 0);
        assert_eq!(service, 0);
        assert_eq!(task, 1);
        assert_eq!(browser, 1);
        assert_eq!(dev_tool, 2);
        assert_eq!(hardware, 2);
        assert_eq!(power, 1);
        assert_eq!(network, 1);
        assert!(items
            .iter()
            .any(|i| i.name == r"\GoogleUpdateTaskMachineUA"));
    }

    #[test]
    fn mock_collector_is_stable_across_calls() {
        let collector = MockConfigCollector::new();
        let first = collector.collect().expect("first collect");
        let second = collector.collect().expect("second collect");
        let first_names: Vec<&str> = first.iter().map(|item| item.name.as_str()).collect();
        let second_names: Vec<&str> = second.iter().map(|item| item.name.as_str()).collect();
        assert_eq!(first_names, second_names);
    }

    #[test]
    fn service_filter_skips_windows_system_services() {
        assert!(should_skip_service(
            "wuauserv",
            "Windows Update",
            Some(r"C:\Windows\system32\svchost.exe -k netsvcs -p"),
        ));
        assert!(should_skip_service(
            "Spooler",
            "Print Spooler",
            Some(r"%SystemRoot%\System32\spoolsv.exe"),
        ));
        assert!(should_skip_service(
            "TrustedInstaller",
            "@%SystemRoot%\\servicing\\TrustedInstaller.exe,-100",
            Some(r"%SystemRoot%\servicing\TrustedInstaller.exe"),
        ));
        assert!(should_skip_service(
            "WinDefend",
            "@C:\\ProgramData\\Microsoft\\Windows Defender\\Platform\\MpAsDesc.dll,-310",
            Some(r"C:\ProgramData\Microsoft\Windows Defender\Platform\4.18.26050.15-0\MsMpEng.exe"),
        ));
        assert!(should_skip_service(
            "edgeupdate",
            "Microsoft Edge Update Service (edgeupdate)",
            Some(r"C:\Program Files (x86)\Microsoft\EdgeUpdate\MicrosoftEdgeUpdate.exe"),
        ));
        assert!(should_skip_service(
            "GoogleChromeElevationService",
            "Google Chrome Elevation Service (GoogleChromeElevationService)",
            Some(r"C:\Program Files\Google\Chrome\Application\149.0\elevation_service.exe"),
        ));
        assert!(!should_skip_service(
            "com.docker.service",
            "Docker Desktop Service",
            Some(r"C:\Program Files\Docker\Docker\com.docker.service"),
        ));
    }

    #[test]
    fn scheduled_task_filter_skips_microsoft_windows_tree() {
        assert!(should_skip_scheduled_task(
            r"\Microsoft\Windows\Defrag\ScheduledDefrag",
        ));
        assert!(should_skip_scheduled_task(
            r"\Microsoft\Windows\Application Experience\ProgramDataUpdater",
        ));
        assert!(!should_skip_scheduled_task(r"\GoogleUpdateTaskMachineUA"));
        assert!(!should_skip_scheduled_task(
            r"\Microsoft\Office\OfficeTelemetryAgentLogOn"
        ));
    }

    #[test]
    fn startup_filter_skips_windows_startup_noise() {
        assert!(should_skip_startup(
            "SecurityHealth",
            Some(r"%windir%\system32\SecurityHealthSystray.exe"),
        ));
        assert!(should_skip_startup(
            "MicrosoftEdgeAutoLaunch_19AEAD38A45691F7301442A8B88EECCF",
            Some(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
        ));
        assert!(!should_skip_startup(
            "Docker Desktop",
            Some(r"C:\Program Files\Docker\Docker\Docker Desktop.exe"),
        ));
    }

    #[test]
    fn network_filter_skips_virtual_default_switches() {
        assert!(should_skip_network_adapter(
            "vEthernet (Default Switch)",
            Some("Hyper-V Virtual Ethernet Adapter"),
        ));
        assert!(!should_skip_network_adapter(
            "Wi-Fi",
            Some("Qualcomm QCA61x4A 802.11ac Wireless Adapter"),
        ));
    }

    #[test]
    fn windows_apps_aliases_are_not_real_dev_tools() {
        assert!(is_windows_apps_alias(
            r"C:\Users\IT\AppData\Local\Microsoft\WindowsApps\python.exe",
        ));
        assert!(!is_windows_apps_alias(r"C:\Program Files\Git\cmd\git.exe",));
    }
}
