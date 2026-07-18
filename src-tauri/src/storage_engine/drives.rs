//! Logical drive / volume enumeration for UI disk pickers.

use sysinfo::Disks;

use crate::error::CoreError;
use crate::models::LogicalDrive;

/// Lists mounted fixed and removable volumes suitable for volume map / backup.
///
/// Returns drive roots sorted alphabetically by mount path (e.g. `C:\` first).
/// Skips zero-capacity entries (virtual / unmounted placeholders).
pub fn list_logical_drives() -> Result<Vec<LogicalDrive>, CoreError> {
    let disks = Disks::new_with_refreshed_list();
    let mut out: Vec<LogicalDrive> = disks
        .list()
        .iter()
        .filter_map(|disk| {
            let total = disk.total_space();
            if total == 0 {
                return None;
            }
            let mount = normalize_mount(disk.mount_point().to_string_lossy().as_ref());
            if mount.is_empty() {
                return None;
            }
            let label_raw = disk.name().to_string_lossy().trim().to_string();
            let label = if label_raw.is_empty() || label_raw.eq_ignore_ascii_case(&mount) {
                None
            } else {
                Some(label_raw)
            };
            let fs_raw = disk.file_system().to_string_lossy().trim().to_string();
            let file_system = if fs_raw.is_empty() {
                None
            } else {
                Some(fs_raw)
            };
            Some(LogicalDrive {
                name: mount,
                label,
                total_bytes: total as i64,
                available_bytes: disk.available_space() as i64,
                file_system,
                is_removable: disk.is_removable(),
            })
        })
        .collect();

    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name));
    Ok(out)
}

/// Normalize mount paths so Windows roots are `X:\` form.
fn normalize_mount(raw: &str) -> String {
    let t = raw.trim();
    if t.is_empty() {
        return String::new();
    }
    // "C:" / "C:\" / "C:/" → "C:\"
    if t.len() >= 2 {
        let bytes = t.as_bytes();
        if bytes[1] == b':' {
            let letter = (bytes[0] as char).to_ascii_uppercase();
            if letter.is_ascii_alphabetic() {
                return format!("{letter}:\\");
            }
        }
    }
    // Keep other mounts (Unix) as-is, ensure trailing slash for consistency
    // is optional; UI uses the path as returned by the OS.
    t.replace('/', "\\")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_drive_letters() {
        assert_eq!(normalize_mount("C:"), "C:\\");
        assert_eq!(normalize_mount("c:\\"), "C:\\");
        assert_eq!(normalize_mount("D:/"), "D:\\");
    }

    #[test]
    fn list_logical_drives_returns_something_or_empty() {
        // On CI/dev boxes this should succeed; empty is ok only if no disks.
        let drives = list_logical_drives().expect("list drives");
        for d in &drives {
            assert!(!d.name.is_empty());
            assert!(d.total_bytes > 0);
            assert!(d.available_bytes >= 0);
        }
    }
}
