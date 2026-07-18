//! Volume / MFT-style fast enumeration for WizTree-class maps.
//!
//! True raw $MFT parsing needs kernel/backup privileges. We implement a
//! practical path: recursive metadata walk with hard caps, system-dir skips,
//! reparse-point avoidance, and a wall-clock deadline so the UI never freezes.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use crate::error::CoreError;
use crate::models::StorageFolderNode;

/// Hard cap on files visited during a volume map (keeps IPC responsive).
const MAX_FILES: usize = 40_000;
/// Max directory depth from the volume root.
const MAX_DEPTH: u32 = 6;
/// Max children kept per node (sorted by size).
const MAX_CHILDREN: usize = 40;
/// Abort the walk after this wall-clock budget so mapping cannot hang forever.
const MAP_DEADLINE: Duration = Duration::from_secs(12);

/// Directory / file name markers to skip (matched on last path component).
const SKIP_NAMES: &[&str] = &[
    "$recycle.bin",
    "system volume information",
    "winsxs",
    "windowsapps",
    "pagefile.sys",
    "hiberfil.sys",
    "swapfile.sys",
    "dumpstack.log.tmp",
];

/// Full-path substrings to skip (normalized lowercase with backslashes).
const SKIP_PATH_MARKERS: &[&str] = &[
    "\\windows\\winsxs",
    "\\windows\\installer",
    "\\windows\\servicing",
    "\\windows\\softwaredistribution",
    "\\windows\\assembly",
    "\\windows\\csc",
    "\\$recycle.bin",
    "\\system volume information",
    "\\programdata\\microsoft\\windows\\containers",
    "\\program files\\windowsapps",
    "\\.git\\objects",
    "\\node_modules\\",
];

/// Build a volume map for a drive root (e.g. `C:\` or `D:\`).
pub fn volume_map(volume: Option<String>) -> Result<StorageFolderNode, CoreError> {
    let root = resolve_volume_root(volume);
    let deadline = Instant::now() + MAP_DEADLINE;
    let mut files_seen = 0usize;
    let mut timed_out = false;
    let mut node = map_volume_dir(
        &root,
        0,
        &mut files_seen,
        &deadline,
        &mut timed_out,
    );
    // Root always reports 100% of itself.
    node.pct_of_parent = 100.0;
    Ok(node)
}

fn resolve_volume_root(volume: Option<String>) -> PathBuf {
    if let Some(v) = volume {
        let t = v.trim();
        if !t.is_empty() {
            let p = PathBuf::from(t);
            if p.is_dir() {
                return p;
            }
            // "C:" -> "C:\"
            if t.len() == 2 && t.as_bytes()[1] == b':' {
                return PathBuf::from(format!("{t}\\"));
            }
        }
    }
    PathBuf::from("C:\\")
}

fn map_volume_dir(
    path: &Path,
    depth: u32,
    files_seen: &mut usize,
    deadline: &Instant,
    timed_out: &mut bool,
) -> StorageFolderNode {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.display().to_string());

    let empty = |size: i64, files: i64| StorageFolderNode {
        path: path.display().to_string(),
        name: name.clone(),
        size_bytes: size,
        file_count: files,
        pct_of_parent: 0.0,
        children: Vec::new(),
    };

    if *timed_out || Instant::now() >= *deadline {
        *timed_out = true;
        return empty(0, 0);
    }
    if *files_seen >= MAX_FILES || depth > MAX_DEPTH {
        return empty(0, 0);
    }
    if should_skip_volume_path(path) {
        return empty(0, 0);
    }

    // Use symlink_metadata so we do not follow junctions / reparse points.
    let meta = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(_) => return empty(0, 0),
    };
    if is_reparse_point(&meta) {
        return empty(0, 0);
    }
    if meta.is_file() {
        *files_seen += 1;
        let len = meta.len() as i64;
        return empty(len, 1);
    }
    if !meta.is_dir() {
        return empty(0, 0);
    }

    let mut size_bytes: i64 = 0;
    let mut file_count: i64 = 0;
    let mut children: Vec<StorageFolderNode> = Vec::new();

    let entries = match fs::read_dir(path) {
        Ok(e) => e,
        Err(_) => return empty(0, 0),
    };

    for entry in entries.flatten() {
        if *timed_out || Instant::now() >= *deadline {
            *timed_out = true;
            break;
        }
        if *files_seen >= MAX_FILES {
            break;
        }

        let child = entry.path();
        if should_skip_volume_path(&child) {
            continue;
        }

        let child_meta = match fs::symlink_metadata(&child) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if is_reparse_point(&child_meta) {
            continue;
        }

        if child_meta.is_file() {
            *files_seen += 1;
            let len = child_meta.len() as i64;
            size_bytes += len;
            file_count += 1;
        } else if child_meta.is_dir() {
            if depth < MAX_DEPTH {
                let node =
                    map_volume_dir(&child, depth + 1, files_seen, deadline, timed_out);
                size_bytes += node.size_bytes;
                file_count += node.file_count;
                if node.size_bytes > 0 {
                    children.push(node);
                }
            } else {
                // At max depth: count immediate files only (no deeper walk).
                if let Ok(sub) = fs::read_dir(&child) {
                    for e in sub.flatten() {
                        if *files_seen >= MAX_FILES || Instant::now() >= *deadline {
                            *timed_out = Instant::now() >= *deadline;
                            break;
                        }
                        if let Ok(m) = e.metadata() {
                            if m.is_file() {
                                *files_seen += 1;
                                size_bytes += m.len() as i64;
                                file_count += 1;
                            }
                        }
                    }
                }
            }
        }
    }

    children.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    children.truncate(MAX_CHILDREN);
    let parent = size_bytes.max(1);
    for c in &mut children {
        c.pct_of_parent = (c.size_bytes as f64 / parent as f64) * 100.0;
    }

    StorageFolderNode {
        path: path.display().to_string(),
        name,
        size_bytes,
        file_count,
        pct_of_parent: 100.0,
        children,
    }
}

fn should_skip_volume_path(path: &Path) -> bool {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if SKIP_NAMES.iter().any(|s| *s == name.as_str()) {
        return true;
    }
    let lower = path.to_string_lossy().to_lowercase().replace('/', "\\");
    SKIP_PATH_MARKERS
        .iter()
        .any(|marker| lower.contains(marker))
}

fn is_reparse_point(meta: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        // FILE_ATTRIBUTE_REPARSE_POINT = 0x400
        (meta.file_attributes() & 0x400) != 0
    }
    #[cfg(not(windows))]
    {
        meta.file_type().is_symlink()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn volume_map_temp() {
        let tmp = std::env::temp_dir();
        let node = volume_map(Some(tmp.display().to_string())).expect("map");
        assert!(!node.path.is_empty());
    }

    #[test]
    fn skips_system_volume_paths() {
        assert!(should_skip_volume_path(Path::new(
            r"C:\$Recycle.Bin"
        )));
        assert!(should_skip_volume_path(Path::new(
            r"C:\Windows\WinSxS\manifests"
        )));
        assert!(should_skip_volume_path(Path::new(
            r"C:\System Volume Information"
        )));
        assert!(!should_skip_volume_path(Path::new(
            r"C:\Users\me\Documents"
        )));
    }

    #[test]
    fn volume_map_respects_deadline_and_caps() {
        // Map temp dir; must return promptly even if large.
        let start = Instant::now();
        let node = volume_map(Some(std::env::temp_dir().display().to_string()))
            .expect("map");
        assert!(start.elapsed() < Duration::from_secs(15));
        assert!(!node.path.is_empty());
    }
}
