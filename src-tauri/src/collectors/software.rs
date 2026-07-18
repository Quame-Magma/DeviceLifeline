//! Installed-software collectors.
//!
//! [`WindowsSoftwareCollector`] reads the three Windows uninstall registry
//! roots (compiled only on Windows). [`MockSoftwareCollector`] returns a fixed
//! set of entries and is always compiled so non-Windows builds and unit tests
//! have a deterministic source.

use crate::error::CollectorError;
use crate::models::RawSoftware;

use super::SoftwareCollector;

/// Reads installed software from the Windows uninstall registry keys.
///
/// Scans, under both 64-bit and 32-bit (WOW6432Node) views:
/// - `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`
/// - `HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall`
/// - `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`
///
/// Entries without a `DisplayName` are skipped. Results are deduplicated by
/// `(name, version)`.
#[cfg(windows)]
pub struct WindowsSoftwareCollector;

#[cfg(windows)]
impl WindowsSoftwareCollector {
    /// Creates a new collector.
    pub fn new() -> Self {
        WindowsSoftwareCollector
    }
}

#[cfg(windows)]
impl Default for WindowsSoftwareCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(windows)]
impl SoftwareCollector for WindowsSoftwareCollector {
    fn collect(&self) -> Result<Vec<RawSoftware>, CollectorError> {
        use std::collections::HashSet;

        use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
        use winreg::RegKey;

        const UNINSTALL: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
        const UNINSTALL_WOW: &str =
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall";

        // (root hive, subkey path) pairs to scan. Hive type is `winreg`'s
        // `HKEY`; rely on inference rather than hard-coding the underlying repr.
        let roots = [
            (HKEY_LOCAL_MACHINE, UNINSTALL),
            (HKEY_LOCAL_MACHINE, UNINSTALL_WOW),
            (HKEY_CURRENT_USER, UNINSTALL),
        ];

        let mut seen: HashSet<(String, Option<String>)> = HashSet::new();
        let mut items: Vec<RawSoftware> = Vec::new();

        for (hive, path) in roots {
            let root = RegKey::predef(hive);
            // A missing root (e.g., no WOW6432Node on 32-bit Windows) is not an
            // error; simply skip it.
            let uninstall = match root.open_subkey_with_flags(path, KEY_READ) {
                Ok(key) => key,
                Err(_) => continue,
            };

            for subkey_name in uninstall.enum_keys().flatten() {
                let entry = match uninstall.open_subkey_with_flags(&subkey_name, KEY_READ) {
                    Ok(entry) => entry,
                    Err(_) => continue,
                };

                // DisplayName is required; skip entries without one.
                let name: String = match entry.get_value("DisplayName") {
                    Ok(value) => value,
                    Err(_) => continue,
                };
                let name = name.trim().to_string();
                if name.is_empty() {
                    continue;
                }

                let version = read_optional(&entry, "DisplayVersion");
                let publisher = read_optional(&entry, "Publisher");
                let install_date = read_optional(&entry, "InstallDate");
                let install_location = read_optional(&entry, "InstallLocation");
                let release_type = read_optional(&entry, "ReleaseType");
                let parent_key_name = read_optional(&entry, "ParentKeyName");
                let system_component = read_optional_dword(&entry, "SystemComponent") == Some(1);

                if should_skip_registry_software(
                    &subkey_name,
                    &name,
                    publisher.as_deref(),
                    install_location.as_deref(),
                    system_component,
                    release_type.as_deref(),
                    parent_key_name.as_deref(),
                ) {
                    continue;
                }

                let dedupe_key = (name.clone(), version.clone());
                if !seen.insert(dedupe_key) {
                    continue;
                }

                items.push(RawSoftware {
                    name,
                    version,
                    publisher,
                    install_date,
                    install_location,
                    source: "registry".to_string(),
                });
            }
        }

        collect_store_apps(&mut seen, &mut items);

        Ok(items)
    }
}

#[cfg(windows)]
#[derive(serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct AppxPackage {
    name: Option<String>,
    version: Option<String>,
    publisher: Option<String>,
    install_location: Option<String>,
}

/// Appends Microsoft Store / Appx packages visible to the current user.
#[cfg(windows)]
fn collect_store_apps(
    seen: &mut std::collections::HashSet<(String, Option<String>)>,
    items: &mut Vec<RawSoftware>,
) {
    

    let output = match crate::process_win::silent_command("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "Get-AppxPackage | Select-Object Name,Version,Publisher,InstallLocation | ConvertTo-Json -Compress -Depth 2",
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

    for package in parse_appx_packages(&json) {
        let name = match package.name.map(|name| name.trim().to_string()) {
            Some(name) if !name.is_empty() => name,
            _ => continue,
        };
        let version = package.version.and_then(non_empty);
        let publisher = package.publisher.and_then(non_empty);
        let install_location = package.install_location.and_then(non_empty);
        if should_skip_appx_package(&name, publisher.as_deref(), install_location.as_deref()) {
            continue;
        }

        let dedupe_key = (name.clone(), version.clone());
        if !seen.insert(dedupe_key) {
            continue;
        }

        items.push(RawSoftware {
            name,
            version,
            publisher,
            install_date: None,
            install_location,
            source: "microsoft_store".to_string(),
        });
    }
}

#[cfg(windows)]
fn parse_appx_packages(json: &str) -> Vec<AppxPackage> {
    let value = match serde_json::from_str::<serde_json::Value>(json) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };

    if value.is_array() {
        serde_json::from_value::<Vec<AppxPackage>>(value).unwrap_or_default()
    } else {
        serde_json::from_value::<AppxPackage>(value)
            .map(|package| vec![package])
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
fn should_skip_registry_software(
    subkey_name: &str,
    name: &str,
    publisher: Option<&str>,
    install_location: Option<&str>,
    system_component: bool,
    release_type: Option<&str>,
    parent_key_name: Option<&str>,
) -> bool {
    let name_l = normalized(name);
    if name_l.is_empty() {
        return true;
    }

    if is_runtime_or_servicing_component(&name_l) {
        return true;
    }

    if is_registry_support_component(&name_l) {
        return true;
    }

    if is_user_facing_microsoft_app(&name_l) {
        return false;
    }

    if system_component || parent_key_name.map(has_text).unwrap_or(false) {
        return true;
    }

    let release_l = release_type.map(normalized).unwrap_or_default();
    if matches!(
        release_l.as_str(),
        "hotfix" | "security update" | "update" | "update rollup" | "service pack"
    ) {
        return true;
    }

    let subkey_l = normalized(subkey_name);
    if subkey_l.starts_with("kb")
        || name_l.starts_with("kb")
        || name_l.starts_with("update for ")
        || name_l.starts_with("security update")
        || name_l.contains("(kb")
    {
        return true;
    }

    let publisher_l = publisher.map(normalized).unwrap_or_default();
    if publisher_l.contains("microsoft")
        && (name_l.contains(" redistributable") || name_l.contains(" runtime"))
    {
        return true;
    }

    let location_l = install_location.map(normalized).unwrap_or_default();
    location_l.contains(r"\windows\servicing") || location_l.contains(r"\windows\winsxs")
}

#[cfg(any(windows, test))]
fn should_skip_appx_package(
    name: &str,
    publisher: Option<&str>,
    install_location: Option<&str>,
) -> bool {
    let name_l = normalized(name);
    if name_l.is_empty() {
        return true;
    }

    if is_guid_like(&name_l) {
        return true;
    }

    if is_allowed_microsoft_appx(&name_l) {
        return false;
    }

    if name_l.contains("vclibs")
        || name_l.contains("net.native")
        || name_l.contains("shellextension")
        || name_l.ends_with("driver")
        || name_l.contains("printerdriver")
        || name_l.starts_with("windows.")
        || name_l.starts_with("microsoft.ui.xaml")
        || name_l.starts_with("microsoft.services.store.engagement")
        || name_l.starts_with("microsoft.windows.")
        || name_l.starts_with("microsoftwindows.")
        || name_l.starts_with("microsoft.aad.")
        || name_l.starts_with("microsoft.accountscontrol")
        || name_l.starts_with("microsoft.async")
        || name_l.starts_with("microsoft.bioenrollment")
        || name_l.starts_with("microsoft.creddialoghost")
        || name_l.starts_with("microsoft.lockapp")
        || name_l.starts_with("microsoft.sechealthui")
        || name_l.starts_with("microsoft.win32webviewhost")
        || name_l.starts_with("microsoft.xbox")
        || name_l.starts_with("microsoft.zune")
        || name_l.starts_with("microsoft.bing")
        || name_l.starts_with("microsoft.gethelp")
        || name_l.starts_with("microsoft.getstarted")
        || name_l.starts_with("microsoft.people")
        || name_l.starts_with("microsoft.yourphone")
    {
        return true;
    }

    let publisher_l = publisher.map(normalized).unwrap_or_default();
    let location_l = install_location.map(normalized).unwrap_or_default();
    publisher_l.contains("cn=microsoft windows")
        || (publisher_l.contains("cn=microsoft corporation") && !is_allowed_microsoft_appx(&name_l))
        || location_l.contains(r"\windows\systemapps")
}

#[cfg(any(windows, test))]
fn is_user_facing_microsoft_app(name_l: &str) -> bool {
    [
        "microsoft 365",
        "microsoft office",
        "microsoft onedrive",
        "microsoft teams",
        "microsoft visual studio",
        "visual studio",
        "visual studio code",
        "microsoft edge",
        "microsoft powertoys",
        "power bi desktop",
        "windows terminal",
    ]
    .iter()
    .any(|needle| name_l.contains(needle))
}

#[cfg(any(windows, test))]
fn is_allowed_microsoft_appx(name_l: &str) -> bool {
    [
        "msteams",
        "microsoft.windowsterminal",
        "microsoft.powershell",
        "microsoft.powertoys",
        "microsoft.teams",
        "microsoftcorporationii.windowssubsystemforlinux",
    ]
    .iter()
    .any(|prefix| name_l.starts_with(prefix))
}

#[cfg(any(windows, test))]
fn is_runtime_or_servicing_component(name_l: &str) -> bool {
    [
        "microsoft visual c++",
        "microsoft .net",
        "microsoft asp.net",
        "microsoft windows desktop runtime",
        "microsoft edge webview2 runtime",
        "microsoft edge update",
        "microsoft update health tools",
        "microsoft windows sdk",
        "windows software development kit",
        "windows sdk addon",
        "windows driver package",
    ]
    .iter()
    .any(|prefix| name_l.starts_with(prefix))
}

#[cfg(any(windows, test))]
fn is_registry_support_component(name_l: &str) -> bool {
    [
        "adobe genuine service",
        "apple mobile device support",
        "microsoft visual studio setup configuration",
        "microsoft visual studio setup wmi provider",
        "uxp webview support",
        "vs_coreeditorfonts",
    ]
    .iter()
    .any(|prefix| name_l.starts_with(prefix))
        || name_l.contains(" driver")
        || name_l.ends_with(" driver")
}

#[cfg(any(windows, test))]
fn is_guid_like(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 36 {
        return false;
    }

    for (index, byte) in bytes.iter().enumerate() {
        if matches!(index, 8 | 13 | 18 | 23) {
            if *byte != b'-' {
                return false;
            }
        } else if !byte.is_ascii_hexdigit() {
            return false;
        }
    }
    true
}

#[cfg(any(windows, test))]
fn normalized(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

#[cfg(any(windows, test))]
fn has_text(value: &str) -> bool {
    !value.trim().is_empty()
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

/// Reads a DWORD registry value, returning `None` when missing or non-DWORD.
#[cfg(windows)]
fn read_optional_dword(key: &winreg::RegKey, name: &str) -> Option<u32> {
    key.get_value::<u32, _>(name).ok()
}

/// A deterministic, cross-platform collector used on non-Windows builds and in
/// tests. Always returns the same six entries with `source = "mock"`.
pub struct MockSoftwareCollector;

impl MockSoftwareCollector {
    /// Creates a new mock collector.
    pub fn new() -> Self {
        MockSoftwareCollector
    }
}

impl Default for MockSoftwareCollector {
    fn default() -> Self {
        Self::new()
    }
}

impl SoftwareCollector for MockSoftwareCollector {
    fn collect(&self) -> Result<Vec<RawSoftware>, CollectorError> {
        let mock = |name: &str, version: &str, publisher: &str, location: &str| RawSoftware {
            name: name.to_string(),
            version: Some(version.to_string()),
            publisher: Some(publisher.to_string()),
            install_date: None,
            install_location: Some(location.to_string()),
            source: "mock".to_string(),
        };

        Ok(vec![
            mock(
                "Google Chrome",
                "125.0.6422.142",
                "Google LLC",
                r"C:\Program Files\Google\Chrome",
            ),
            mock(
                "Visual Studio Code",
                "1.90.0",
                "Microsoft Corporation",
                r"C:\Program Files\Microsoft VS Code",
            ),
            mock("7-Zip", "23.01", "Igor Pavlov", r"C:\Program Files\7-Zip"),
            mock(
                "Node.js",
                "20.14.0",
                "OpenJS Foundation",
                r"C:\Program Files\nodejs",
            ),
            mock(
                "Docker Desktop",
                "4.31.0",
                "Docker Inc.",
                r"C:\Program Files\Docker\Docker",
            ),
            mock(
                "Git",
                "2.45.2",
                "The Git Development Community",
                r"C:\Program Files\Git",
            ),
        ])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_collector_returns_six_deterministic_items() {
        let collector = MockSoftwareCollector::new();
        let items = collector.collect().expect("mock collect");
        assert_eq!(items.len(), 6);
        assert!(items.iter().all(|item| item.source == "mock"));
        assert!(items.iter().any(|item| item.name == "Google Chrome"));
    }

    #[test]
    fn mock_collector_is_stable_across_calls() {
        let collector = MockSoftwareCollector::new();
        let first = collector.collect().expect("first collect");
        let second = collector.collect().expect("second collect");
        let first_names: Vec<&str> = first.iter().map(|item| item.name.as_str()).collect();
        let second_names: Vec<&str> = second.iter().map(|item| item.name.as_str()).collect();
        assert_eq!(first_names, second_names);
    }

    #[test]
    fn registry_filter_skips_windows_servicing_noise() {
        assert!(should_skip_registry_software(
            "{KB5034441}",
            "Security Update for Microsoft Windows (KB5034441)",
            Some("Microsoft Corporation"),
            None,
            false,
            Some("Security Update"),
            None,
        ));
        assert!(should_skip_registry_software(
            "{runtime}",
            "Microsoft Visual C++ 2015-2022 Redistributable (x64)",
            Some("Microsoft Corporation"),
            None,
            false,
            None,
            None,
        ));
        assert!(should_skip_registry_software(
            "{hidden}",
            "Hidden Windows Component",
            Some("Microsoft Corporation"),
            None,
            true,
            None,
            None,
        ));
    }

    #[test]
    fn registry_filter_keeps_user_facing_apps() {
        assert!(!should_skip_registry_software(
            "{vscode}",
            "Microsoft Visual Studio Code",
            Some("Microsoft Corporation"),
            Some(r"C:\Program Files\Microsoft VS Code"),
            false,
            None,
            None,
        ));
        assert!(!should_skip_registry_software(
            "{chrome}",
            "Google Chrome",
            Some("Google LLC"),
            Some(r"C:\Program Files\Google\Chrome"),
            false,
            None,
            None,
        ));
    }

    #[test]
    fn appx_filter_skips_frameworks_and_keeps_user_packages() {
        assert!(should_skip_appx_package(
            "Microsoft.UI.Xaml.2.8",
            Some("CN=Microsoft Corporation"),
            Some(r"C:\Program Files\WindowsApps\Microsoft.UI.Xaml.2.8"),
        ));
        assert!(should_skip_appx_package(
            "Microsoft.Windows.ShellExperienceHost",
            Some("CN=Microsoft Windows"),
            Some(r"C:\Program Files\WindowsApps\Microsoft.Windows.ShellExperienceHost"),
        ));
        assert!(!should_skip_appx_package(
            "SpotifyAB.SpotifyMusic",
            Some("CN=Spotify AB"),
            Some(r"C:\Program Files\WindowsApps\SpotifyAB.SpotifyMusic"),
        ));
    }

    #[test]
    fn appx_filter_skips_inbox_microsoft_packages_from_real_snapshots() {
        assert!(should_skip_appx_package(
            "1527c705-839a-4832-9118-54d4Bd6a0c89",
            Some("CN=Microsoft Windows, O=Microsoft Corporation"),
            None,
        ));
        assert!(should_skip_appx_package(
            "Microsoft.WindowsAppRuntime.1.8",
            Some("CN=Microsoft Corporation, O=Microsoft Corporation"),
            Some(r"C:\Program Files\WindowsApps\Microsoft.WindowsAppRuntime.1.8"),
        ));
        assert!(should_skip_appx_package(
            "Microsoft.DesktopAppInstaller",
            Some("CN=Microsoft Corporation, O=Microsoft Corporation"),
            Some(r"C:\Program Files\WindowsApps\Microsoft.DesktopAppInstaller"),
        ));
        assert!(should_skip_appx_package(
            "Windows.CBSPreview",
            Some("CN=Microsoft Windows, O=Microsoft Corporation"),
            None,
        ));
        assert!(!should_skip_appx_package(
            "Microsoft.PowerShell",
            Some("CN=Microsoft Corporation, O=Microsoft Corporation"),
            Some(r"C:\Program Files\WindowsApps\Microsoft.PowerShell"),
        ));
    }

    #[test]
    fn registry_filter_skips_support_components_from_real_snapshots() {
        assert!(should_skip_registry_software(
            "{vsconfig}",
            "Microsoft Visual Studio Setup Configuration",
            Some("Microsoft Corporation"),
            None,
            false,
            None,
            None,
        ));
        assert!(should_skip_registry_software(
            "{driver}",
            "Realtek High Definition Audio Driver",
            Some("Realtek Semiconductor Corp."),
            None,
            false,
            None,
            None,
        ));
        assert!(should_skip_registry_software(
            "{sdk}",
            "Windows SDK AddOn",
            Some("Microsoft Corporation"),
            None,
            false,
            None,
            None,
        ));
    }
}
