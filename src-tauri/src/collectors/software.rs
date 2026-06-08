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

        Ok(items)
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
}
