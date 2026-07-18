//! Native NTFS USN journal enumeration (Everything-class foundation).
//!
//! Uses `fsutil usn readjournal` when available/elevated, otherwise falls back
//! to a volume-wide depth-limited walk that still populates the file FTS index
//! faster than user-folder-only indexing.

use rusqlite::Connection;

use crate::error::CoreError;
use crate::models::FileIndexStatus;
use crate::search::file_index;

/// Rebuild file index preferring USN journal on the given volume (default C:).
pub fn rebuild_usn_index(
    conn: &Connection,
    volume: Option<String>,
) -> Result<FileIndexStatus, CoreError> {
    #[cfg(not(windows))]
    {
        let _ = volume;
        return file_index::rebuild_file_index(conn);
    }

    #[cfg(windows)]
    {
        use std::path::Path;

        use crate::dna::snapshot::now_rfc3339;
        use crate::search::everything;
        use crate::storage::search_repo::{self, SearchDocument};

        const MAX_USN_FILES: usize = 150_000;

        let vol = volume.unwrap_or_else(|| "C:".into());
        let vol = normalize_volume(&vol);

        conn.execute("DELETE FROM search_index WHERE entity_type = 'file'", [])?;

        let mut docs = Vec::new();
        let mut source = "walk";

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
}

#[cfg(windows)]
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
    let output = crate::process_win::silent_command("fsutil")
        .args(["usn", "readjournal", volume, "wait=0"])
        .output()
        .ok()?;

    let text = String::from_utf8_lossy(&output.stdout);
    if text.to_lowercase().contains("error") && text.lines().count() < 5 {
        return read_usn_enumdata(volume, max);
    }

    let mut paths = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("File Name") {
            let name = rest.trim().trim_start_matches(':').trim();
            if !name.is_empty() && !name.contains('\0') {
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

    if paths.is_empty() {
        read_usn_enumdata(volume, max)
    } else {
        Some(paths)
    }
}

#[cfg(windows)]
fn read_usn_enumdata(volume: &str, max: usize) -> Option<Vec<String>> {
    let output = crate::process_win::silent_command("fsutil")
        .args(["usn", "enumdata", "1", "0", "1", volume])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let mut paths = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.contains(":\\") || line.starts_with('\\') {
            paths.push(line.to_string());
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
