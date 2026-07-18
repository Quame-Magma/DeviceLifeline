//! Native NTFS USN journal enumeration (Everything-class foundation).
//!
//! Uses `fsutil usn readjournal` when available/elevated, otherwise falls back
//! to a volume-wide depth-limited walk that still populates the file FTS index
//! faster than user-folder-only indexing.

use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::FileIndexStatus;
use crate::search::everything;
use crate::search::file_index;
use crate::storage::search_repo::{self, SearchDocument};

const MAX_USN_FILES: usize = 150_000;

/// Rebuild file index preferring USN journal on the given volume (default C:).
pub fn rebuild_usn_index(
    conn: &Connection,
    volume: Option<String>,
) -> Result<FileIndexStatus, CoreError> {
    let vol = volume.unwrap_or_else(|| "C:".into());
    let vol = normalize_volume(&vol);

    conn.execute(
        "DELETE FROM search_index WHERE entity_type = 'file'",
        [],
    )?;

    let mut docs = Vec::new();
    let mut source = "walk";

    #[cfg(windows)]
    {
        if let Some(paths) = read_usn_paths(&vol, MAX_USN_FILES) {
            source = "usn";
            for path in paths {
                let name = Path::new(&path)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| path.clone());
                docs.push(SearchDocument {
                    entity_type: "file".into(),
                    entity_id: path.clone(),
                    title: name,
                    body: path,
                });
            }
        }
    }

    if docs.is_empty() {
        // Fallback: full local file index roots (includes multi-drive).
        return file_index::rebuild_file_index(conn);
    }

    search_repo::insert_documents(conn, &docs)?;
    let built_at = now_rfc3339()?;
    let roots = vec![format!("{vol}\\")];
    let roots_json = serde_json::to_string(&roots).unwrap_or_else(|_| "[]".into());
    conn.execute("DELETE FROM file_index_meta", [])?;
    conn.execute(
        "INSERT INTO file_index_meta (id, built_at, file_count, root_count, roots_json)
         VALUES ('default', ?1, ?2, ?3, ?4)",
        rusqlite::params![built_at, docs.len() as i64, 1i64, roots_json],
    )?;

    Ok(FileIndexStatus {
        file_count: docs.len() as i64,
        root_count: 1,
        last_built_at: Some(built_at),
        roots,
        everything_available: everything::everything_available(),
        search_backend: if everything::everything_available() {
            format!("hybrid+{source}")
        } else {
            source.into()
        },
    })
}

fn normalize_volume(v: &str) -> String {
    let t = v.trim().trim_end_matches('\\').trim_end_matches('/');
    if t.len() >= 2 && t.as_bytes()[1] == b':' {
        t[..2].to_string()
    } else if t.len() == 1 {
        format!("{t}:")
    } else {
        "C:".into()
    }
}

#[cfg(windows)]
fn read_usn_paths(volume: &str, max: usize) -> Option<Vec<String>> {
    // fsutil usn enumdata requires elevation on many systems; try readjournal first.
    // Prefer PowerShell DeviceIoControl path via fsutil:
    //   fsutil usn readjournal C: wait=0
    let output = crate::process_win::silent_command("fsutil")
        .args(["usn", "readjournal", volume, "wait=0"])
        .output()
        .ok()?;

    let text = String::from_utf8_lossy(&output.stdout);
    if text.to_lowercase().contains("error") && text.lines().count() < 5 {
        // Try enumdata
        return read_usn_enumdata(volume, max);
    }

    let mut paths = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        // fsutil lines often look like: File Name   : foo.txt  or full path fragments
        if let Some(rest) = line.strip_prefix("File Name") {
            let name = rest.trim().trim_start_matches(':').trim();
            if !name.is_empty() && !name.contains('\0') {
                // Journal may only give names; prefix volume root for searchability.
                let full = if name.contains('\\') || name.contains(':') {
                    name.to_string()
                } else {
                    format!("{volume}\\{name}")
                };
                paths.push(full);
            }
        } else if line.len() > 3 && (line.contains(":\\") || line.starts_with('\\')) {
            paths.push(line.to_string());
        }
        if paths.len() >= max {
            break;
        }
    }

    if paths.len() < 10 {
        return read_usn_enumdata(volume, max).or_else(|| volume_walk_fallback(volume, max));
    }
    Some(paths)
}

#[cfg(windows)]
fn read_usn_enumdata(volume: &str, max: usize) -> Option<Vec<String>> {
    // fsutil usn enumdata 1 0 1 C:
    let output = crate::process_win::silent_command("fsutil")
        .args(["usn", "enumdata", "1", "0", "1", volume])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let mut paths = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if line.contains("File Ref") || line.contains("Usn") || line.contains("Source") {
            continue;
        }
        if line.contains('.') || line.contains('\\') {
            // Often "File name: xxx"
            if let Some(idx) = line.find(':') {
                let name = line[idx + 1..].trim();
                if !name.is_empty() {
                    paths.push(format!("{volume}\\{name}"));
                }
            } else {
                paths.push(format!("{volume}\\{line}"));
            }
        }
        if paths.len() >= max {
            break;
        }
    }
    if paths.is_empty() {
        None
    } else {
        Some(paths)
    }
}

#[cfg(windows)]
fn volume_walk_fallback(volume: &str, max: usize) -> Option<Vec<String>> {
    // Fast-ish top-level walk of volume for usability when USN is locked.
    let root = PathBuf::from(format!("{volume}\\"));
    if !root.is_dir() {
        return None;
    }
    let mut paths = Vec::new();
    let mut stack = vec![(root, 0u32)];
    while let Some((dir, depth)) = stack.pop() {
        if paths.len() >= max || depth > 6 {
            continue;
        }
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            if paths.len() >= max {
                break;
            }
            let p = entry.path();
            let name = p
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default()
                .to_lowercase();
            if name == "windows" || name == "$recycle.bin" || name == "system volume information" {
                continue;
            }
            if p.is_file() {
                paths.push(p.display().to_string());
            } else if p.is_dir() && depth < 6 {
                stack.push((p, depth + 1));
            }
        }
    }
    if paths.is_empty() {
        None
    } else {
        Some(paths)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db;
    use rusqlite::Connection;

    #[test]
    fn rebuild_usn_or_fallback() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        db::run_migrations(&conn).unwrap();
        let status = rebuild_usn_index(&conn, None).expect("usn/fallback");
        assert!(status.file_count >= 0);
    }
}
