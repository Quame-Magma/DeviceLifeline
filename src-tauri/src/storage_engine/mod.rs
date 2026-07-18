//! Storage Intelligence engine.
//!
//! Depth-limited directory walks that categorize files, persist top items by
//! size, and emit findings for large files / temp bloat. Never scans secret
//! paths (SSH keys, credential stores, deep browser profiles).
//! Also exposes volume/MFT-style maps via [`volume`] and drive listing via [`drives`].

pub mod drives;
pub mod volume;

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::intelligence::findings::{self, SEVERITY_INFO, SEVERITY_WARNING};
use crate::models::{
    IntelligenceFinding, StorageFolderNode, StorageItem, StorageScan, StorageScanResult,
};
use crate::storage::{device_repo, storage_repo};

/// Maximum directory depth from the scan root.
const MAX_DEPTH: u32 = 10;
/// Hard cap on files inspected per scan.
const MAX_FILES: usize = 50_000;
/// How many largest items to persist.
const TOP_ITEMS_PERSIST: usize = 1_000;
/// Large-file threshold (100 MiB).
const LARGE_FILE_BYTES: u64 = 100 * 1024 * 1024;

/// Directory name fragments that must never be walked.
const SECRET_DIR_MARKERS: &[&str] = &[
    ".ssh",
    ".gnupg",
    ".aws",
    ".azure",
    "credentials",
    "secret",
    "secrets",
    "private keys",
    "privatekeys",
    // Avoid deep browser profile walks under Roaming.
    "google\\chrome\\user data",
    "microsoft\\edge\\user data",
    "mozilla\\firefox\\profiles",
    "brave-browser",
];

/// Internal discovered entry before id assignment.
struct Discovered {
    path: PathBuf,
    name: String,
    size_bytes: u64,
    is_directory: bool,
    category: String,
}

/// Runs a storage scan on `root_path` (or default temp/Downloads roots when
/// `None`), persists the scan + top items, publishes findings, and returns the
/// combined result.
pub fn scan_storage(
    conn: &Connection,
    root_path: Option<String>,
) -> Result<StorageScanResult, CoreError> {
    let device = device_repo::ensure_local_device(conn)?;
    let roots = resolve_roots(root_path);
    let root_label = roots
        .iter()
        .map(|p| p.display().to_string())
        .collect::<Vec<_>>()
        .join("; ");

    let created_at = now_rfc3339()?;
    let scan_id = uuid::Uuid::new_v4().to_string();
    let mut scan = StorageScan {
        id: scan_id.clone(),
        device_id: device.id.clone(),
        root_path: root_label,
        status: "running".to_string(),
        total_bytes: 0,
        file_count: 0,
        dir_count: 0,
        created_at: created_at.clone(),
        finished_at: None,
    };
    storage_repo::insert_scan(conn, &scan)?;

    let mut discovered: Vec<Discovered> = Vec::new();
    let mut file_count: i64 = 0;
    let mut dir_count: i64 = 0;
    let mut total_bytes: i64 = 0;
    let mut files_seen = 0usize;

    for root in &roots {
        walk_limited(
            root,
            0,
            &mut discovered,
            &mut file_count,
            &mut dir_count,
            &mut total_bytes,
            &mut files_seen,
        );
        if files_seen >= MAX_FILES {
            break;
        }
    }

    // Keep largest items for persistence.
    discovered.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    discovered.truncate(TOP_ITEMS_PERSIST);

    let items: Vec<StorageItem> = discovered
        .iter()
        .map(|d| StorageItem {
            id: uuid::Uuid::new_v4().to_string(),
            scan_id: scan_id.clone(),
            path: d.path.display().to_string(),
            name: d.name.clone(),
            kind: if d.is_directory {
                "directory".to_string()
            } else {
                "file".to_string()
            },
            size_bytes: d.size_bytes as i64,
            category: d.category.clone(),
            is_directory: d.is_directory,
        })
        .collect();

    storage_repo::insert_items(conn, &items)?;

    let finished_at = now_rfc3339()?;
    scan.status = "completed".to_string();
    scan.total_bytes = total_bytes;
    scan.file_count = file_count;
    scan.dir_count = dir_count;
    scan.finished_at = Some(finished_at);
    storage_repo::update_scan(conn, &scan)?;

    let findings = build_storage_findings(&device.id, &scan, &items)?;
    findings::publish_findings(conn, &findings)?;

    Ok(StorageScanResult {
        scan,
        items,
        findings,
    })
}

/// Returns the latest completed scan with its items (findings empty unless
/// re-derived — callers that need findings should re-scan or list from the
/// intelligence repo).
pub fn get_latest_scan_with_items(
    conn: &Connection,
) -> Result<Option<StorageScanResult>, CoreError> {
    let Some(scan) = storage_repo::latest_scan(conn)? else {
        return Ok(None);
    };
    let items = storage_repo::list_items(conn, &scan.id)?;
    Ok(Some(StorageScanResult {
        scan,
        items,
        findings: Vec::new(),
    }))
}

/// Builds a hierarchical folder size map (WizTree-style) under an optional root.
/// Defaults to user profile when available, else temp.
pub fn folder_map(
    root_path: Option<String>,
    max_depth: Option<u32>,
) -> Result<StorageFolderNode, CoreError> {
    let root = resolve_map_root(root_path);
    // Deeper default map for real testing (still capped for responsiveness).
    let depth = max_depth.unwrap_or(5).min(8);
    let mut files_seen = 0usize;
    Ok(map_directory(&root, 0, depth, &mut files_seen, 100_000))
}

fn resolve_map_root(root_path: Option<String>) -> PathBuf {
    if let Some(path) = root_path {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    if let Some(home) = user_home_dir() {
        return home;
    }
    std::env::temp_dir()
}

fn map_directory(
    path: &Path,
    depth: u32,
    max_depth: u32,
    files_seen: &mut usize,
    max_files: usize,
) -> StorageFolderNode {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.display().to_string());

    let mut size_bytes: i64 = 0;
    let mut file_count: i64 = 0;
    let mut children: Vec<StorageFolderNode> = Vec::new();

    if should_skip_path(path) || *files_seen >= max_files {
        return StorageFolderNode {
            path: path.display().to_string(),
            name,
            size_bytes: 0,
            file_count: 0,
            pct_of_parent: 0.0,
            children: Vec::new(),
        };
    }

    let entries = match fs::read_dir(path) {
        Ok(e) => e,
        Err(_) => {
            return StorageFolderNode {
                path: path.display().to_string(),
                name,
                size_bytes: 0,
                file_count: 0,
                pct_of_parent: 0.0,
                children: Vec::new(),
            };
        }
    };

    for entry in entries.flatten() {
        if *files_seen >= max_files {
            break;
        }
        let child = entry.path();
        if should_skip_path(&child) {
            continue;
        }
        let meta = match fs::metadata(&child) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.is_file() {
            *files_seen += 1;
            let len = meta.len() as i64;
            size_bytes += len;
            file_count += 1;
        } else if meta.is_dir() {
            if depth < max_depth {
                let node = map_directory(&child, depth + 1, max_depth, files_seen, max_files);
                size_bytes += node.size_bytes;
                file_count += node.file_count;
                if node.size_bytes > 0 {
                    children.push(node);
                }
            } else {
                // Shallow size estimate: count immediate files only.
                if let Ok(sub) = fs::read_dir(&child) {
                    for e in sub.flatten() {
                        if *files_seen >= max_files {
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
    children.truncate(40);
    let parent_size = size_bytes.max(1);
    for child in &mut children {
        child.pct_of_parent = (child.size_bytes as f64 / parent_size as f64) * 100.0;
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

fn resolve_roots(root_path: Option<String>) -> Vec<PathBuf> {
    if let Some(path) = root_path {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return vec![PathBuf::from(trimmed)];
        }
    }

    let mut roots = Vec::new();
    roots.push(std::env::temp_dir());

    // User Downloads when available (Windows and common Unix layouts).
    if let Some(home) = user_home_dir() {
        let downloads = home.join("Downloads");
        if downloads.is_dir() {
            roots.push(downloads);
        }
        #[cfg(windows)]
        {
            let local_temp = home.join("AppData").join("Local").join("Temp");
            if local_temp.is_dir() && !roots.iter().any(|r| r == &local_temp) {
                roots.push(local_temp);
            }
        }
    }

    roots
}

fn user_home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

fn walk_limited(
    path: &Path,
    depth: u32,
    out: &mut Vec<Discovered>,
    file_count: &mut i64,
    dir_count: &mut i64,
    total_bytes: &mut i64,
    files_seen: &mut usize,
) {
    if *files_seen >= MAX_FILES || depth > MAX_DEPTH {
        return;
    }
    if should_skip_path(path) {
        return;
    }

    let metadata = match fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return,
    };

    if metadata.is_file() {
        *files_seen += 1;
        *file_count += 1;
        let size = metadata.len();
        *total_bytes += size as i64;
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.display().to_string());
        out.push(Discovered {
            path: path.to_path_buf(),
            name: name.clone(),
            size_bytes: size,
            is_directory: false,
            category: categorize(path, &name, size, false),
        });
        return;
    }

    if !metadata.is_dir() {
        return;
    }

    *dir_count += 1;
    if depth == 0 {
        // Record root as a directory entry for context (size 0).
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.display().to_string());
        out.push(Discovered {
            path: path.to_path_buf(),
            name,
            size_bytes: 0,
            is_directory: true,
            category: "other".to_string(),
        });
    }

    let entries = match fs::read_dir(path) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        if *files_seen >= MAX_FILES {
            break;
        }
        let child = entry.path();
        if should_skip_path(&child) {
            continue;
        }
        walk_limited(
            &child,
            depth + 1,
            out,
            file_count,
            dir_count,
            total_bytes,
            files_seen,
        );
    }
}

/// Returns true when `path` matches a secret / sensitive directory pattern.
fn should_skip_path(path: &Path) -> bool {
    let lower = path.to_string_lossy().to_lowercase();
    let normalized = lower.replace('/', "\\");
    SECRET_DIR_MARKERS
        .iter()
        .any(|marker| normalized.contains(marker))
}

/// Categorizes a path for storage intelligence.
fn categorize(path: &Path, name: &str, size: u64, is_directory: bool) -> String {
    if is_directory {
        return "other".to_string();
    }
    if size >= LARGE_FILE_BYTES {
        return "large_file".to_string();
    }

    let lower_path = path.to_string_lossy().to_lowercase();
    let lower_name = name.to_lowercase();

    if lower_path.contains("\\temp")
        || lower_path.contains("/temp")
        || lower_path.contains("\\tmp")
        || lower_path.contains("/tmp")
        || lower_name.ends_with(".tmp")
        || lower_name.ends_with(".temp")
    {
        return "temp".to_string();
    }

    if lower_path.contains("cache")
        || lower_name.ends_with(".cache")
        || lower_path.contains("\\caches\\")
        || lower_path.contains("/caches/")
    {
        return "cache".to_string();
    }

    if has_extension(
        &lower_name,
        &[
            ".mp4", ".mkv", ".avi", ".mov", ".mp3", ".wav", ".flac", ".jpg", ".jpeg", ".png",
            ".gif", ".webp",
        ],
    ) {
        return "media".to_string();
    }

    if has_extension(
        &lower_name,
        &[
            ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".md", ".rtf",
            ".csv",
        ],
    ) {
        return "document".to_string();
    }

    "other".to_string()
}

fn has_extension(name: &str, exts: &[&str]) -> bool {
    exts.iter().any(|ext| name.ends_with(ext))
}

fn build_storage_findings(
    device_id: &str,
    scan: &StorageScan,
    items: &[StorageItem],
) -> Result<Vec<IntelligenceFinding>, CoreError> {
    let created_at = now_rfc3339()?;
    let mut findings = Vec::new();

    let large: Vec<&StorageItem> = items
        .iter()
        .filter(|i| !i.is_directory && i.category == "large_file")
        .take(5)
        .collect();
    if !large.is_empty() {
        let names: Vec<String> = large
            .iter()
            .map(|i| format!("{} ({} MB)", i.name, i.size_bytes / (1024 * 1024)))
            .collect();
        findings.push(IntelligenceFinding {
            id: uuid::Uuid::new_v4().to_string(),
            device_id: device_id.to_string(),
            engine: "storage".to_string(),
            kind: "large_files".to_string(),
            severity: SEVERITY_WARNING.to_string(),
            title: format!("{} large file(s) found", large.len()),
            summary: "Files over 100 MB may be reclaimable storage.".to_string(),
            evidence: format!(
                "Largest: {}. Scan root: {}.",
                names.join("; "),
                scan.root_path
            ),
            confidence: 70,
            suggested_action: Some(
                "Review large files in Storage Intelligence before deleting.".to_string(),
            ),
            action_id: None,
            created_at: created_at.clone(),
            dismissed: false,
        });
    }

    let temp_bytes: i64 = items
        .iter()
        .filter(|i| !i.is_directory && matches!(i.category.as_str(), "temp" | "cache"))
        .map(|i| i.size_bytes)
        .sum();
    let temp_count = items
        .iter()
        .filter(|i| !i.is_directory && matches!(i.category.as_str(), "temp" | "cache"))
        .count();

    if temp_bytes > 50 * 1024 * 1024 || temp_count >= 20 {
        findings.push(IntelligenceFinding {
            id: uuid::Uuid::new_v4().to_string(),
            device_id: device_id.to_string(),
            engine: "storage".to_string(),
            kind: "temp_bloat".to_string(),
            severity: if temp_bytes > 500 * 1024 * 1024 {
                SEVERITY_WARNING.to_string()
            } else {
                SEVERITY_INFO.to_string()
            },
            title: "Temporary / cache bloat".to_string(),
            summary: format!(
                "{temp_count} temp/cache item(s) totaling {} MB in the scan set.",
                temp_bytes / (1024 * 1024)
            ),
            evidence: format!(
                "Categories temp+cache: {temp_count} files, {} bytes. Root: {}.",
                temp_bytes, scan.root_path
            ),
            confidence: 65,
            suggested_action: Some(
                "Run a safe cleanup preview (dry-run) before deleting anything.".to_string(),
            ),
            action_id: None,
            created_at,
            dismissed: false,
        });
    }

    Ok(findings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db;
    use std::io::Write;

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("enable foreign keys");
        db::run_migrations(&conn).expect("run migrations");
        conn
    }

    #[test]
    fn should_skip_secret_paths() {
        assert!(should_skip_path(Path::new(r"C:\Users\me\.ssh")));
        assert!(should_skip_path(Path::new(
            r"C:\Users\me\AppData\Roaming\Google\Chrome\User Data\Default"
        )));
        assert!(!should_skip_path(Path::new(
            r"C:\Users\me\Downloads\file.pdf"
        )));
    }

    #[test]
    fn categorize_detects_temp_and_media() {
        assert_eq!(
            categorize(Path::new(r"C:\Temp\a.tmp"), "a.tmp", 100, false),
            "temp"
        );
        assert_eq!(
            categorize(Path::new(r"C:\Videos\movie.mp4"), "movie.mp4", 1000, false),
            "media"
        );
        assert_eq!(
            categorize(
                Path::new(r"C:\big.bin"),
                "big.bin",
                LARGE_FILE_BYTES + 1,
                false
            ),
            "large_file"
        );
    }

    #[test]
    fn scan_storage_on_temp_fixture() {
        let dir =
            std::env::temp_dir().join(format!("devicelifeline_scan_test_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("mkdir");
        let file_path = dir.join("sample.txt");
        {
            let mut f = fs::File::create(&file_path).expect("create");
            writeln!(f, "hello storage").expect("write");
        }

        let conn = memory_db();
        let result = scan_storage(&conn, Some(dir.display().to_string())).expect("scan");
        assert_eq!(result.scan.status, "completed");
        assert!(result.scan.file_count >= 1);
        assert!(!result.items.is_empty());

        let _ = fs::remove_dir_all(&dir);
    }
}
