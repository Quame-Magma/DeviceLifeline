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

    const TASKS: &str =
        r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\TaskCache\Tasks";

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
/// tests. Always returns the same eight entries with `source = "mock"`.
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
        let startup = |name: &str, path: &str| RawConfig {
            kind: "startup".to_string(),
            name: name.to_string(),
            status: Some("enabled".to_string()),
            path: Some(path.to_string()),
            publisher: None,
            source: "mock".to_string(),
        };
        let service = |name: &str, status: &str, path: &str| RawConfig {
            kind: "service".to_string(),
            name: name.to_string(),
            status: Some(status.to_string()),
            path: Some(path.to_string()),
            publisher: None,
            source: "mock".to_string(),
        };
        let task = |name: &str| RawConfig {
            kind: "scheduled_task".to_string(),
            name: name.to_string(),
            status: None,
            path: None,
            publisher: None,
            source: "mock".to_string(),
        };

        Ok(vec![
            startup("OneDrive", r"C:\Program Files\Microsoft OneDrive\OneDrive.exe"),
            startup("Steam", r"C:\Program Files (x86)\Steam\steam.exe"),
            startup("Spotify", r"C:\Users\dev\AppData\Roaming\Spotify\Spotify.exe"),
            service(
                "Windows Update",
                "automatic",
                r"C:\Windows\system32\svchost.exe -k netsvcs -p",
            ),
            service(
                "Print Spooler",
                "automatic",
                r"C:\Windows\System32\spoolsv.exe",
            ),
            service(
                "Connected User Experiences and Telemetry",
                "disabled",
                r"C:\Windows\system32\svchost.exe -k utcsvc -p",
            ),
            task(r"\Microsoft\Windows\Defrag\ScheduledDefrag"),
            task(r"\GoogleUpdateTaskMachineUA"),
        ])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_collector_returns_eight_items_across_all_kinds() {
        let collector = MockConfigCollector::new();
        let items = collector.collect().expect("mock collect");
        assert_eq!(items.len(), 8);
        assert!(items.iter().all(|item| item.source == "mock"));

        let startup = items.iter().filter(|i| i.kind == "startup").count();
        let service = items.iter().filter(|i| i.kind == "service").count();
        let task = items.iter().filter(|i| i.kind == "scheduled_task").count();
        assert_eq!(startup, 3);
        assert_eq!(service, 3);
        assert_eq!(task, 2);
        assert!(items.iter().any(|i| i.name == "Windows Update"));
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
}
