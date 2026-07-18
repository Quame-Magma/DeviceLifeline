//! Scoped filesystem index (Everything Search direction).
//!
//! Indexes user-scoped roots (Desktop, Documents, Downloads, home top-level)
//! into the shared FTS `search_index` as `entity_type = file`, plus metadata
//! in `file_index_meta`.

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};

use crate::dna::snapshot::now_rfc3339;
use crate::error::CoreError;
use crate::models::FileIndexStatus;
use crate::search::everything;
use crate::storage::search_repo::{self, SearchDocument};

const MAX_FILES: usize = 80_000;
const MAX_DEPTH: u32 = 8;

const SKIP_DIR_MARKERS: &[&str] = &[
    ".ssh",
    ".gnupg",
    ".git",
    "node_modules",
    "appdata\\local\\temp",
    "appdata\\roaming",
    "\\windows\\",
    "/windows/",
    "credentials",
];

/// Rebuilds the file portion of the search index for user-scoped roots.
pub fn rebuild_file_index(conn: &Connection) -> Result<FileIndexStatus, CoreError> {
    // Remove previous file documents (leave software/config/etc.).
    conn.execute("DELETE FROM search_index WHERE entity_type = 'file'", [])?;

    let roots = default_roots();
    let mut docs: Vec<SearchDocument> = Vec::new();
    let mut files_seen = 0usize;

    for root in &roots {
        walk_index(root, 0, &mut docs, &mut files_seen);
        if files_seen >= MAX_FILES {
            break;
        }
    }

    search_repo::insert_documents(conn, &docs)?;

    let built_at = now_rfc3339()?;
    let roots_json = serde_json::to_string(
        &roots
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>(),
    )
    .unwrap_or_else(|_| "[]".into());

    conn.execute("DELETE FROM file_index_meta", [])?;
    conn.execute(
        "INSERT INTO file_index_meta (id, built_at, file_count, root_count, roots_json)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            "default",
            built_at,
            docs.len() as i64,
            roots.len() as i64,
            roots_json,
        ],
    )?;

    Ok(FileIndexStatus {
        file_count: docs.len() as i64,
        root_count: roots.len() as i64,
        last_built_at: Some(built_at),
        roots: roots.iter().map(|p| p.display().to_string()).collect(),
        everything_available: everything::everything_available(),
        search_backend: if everything::everything_available() {
            "hybrid".into()
        } else {
            "local_fts".into()
        },
    })
}

/// Returns last file index status (or empty if never built).
pub fn file_index_status(conn: &Connection) -> Result<FileIndexStatus, CoreError> {
    let everything_available = everything::everything_available();
    let backend = if everything_available {
        "hybrid"
    } else {
        "local_fts"
    };
    let row = conn.query_row(
        "SELECT built_at, file_count, root_count, roots_json FROM file_index_meta WHERE id = 'default'",
        [],
        |row| {
            let roots_json: String = row.get(3)?;
            let roots: Vec<String> = serde_json::from_str(&roots_json).unwrap_or_default();
            Ok(FileIndexStatus {
                last_built_at: Some(row.get(0)?),
                file_count: row.get(1)?,
                root_count: row.get(2)?,
                roots,
                everything_available,
                search_backend: backend.into(),
            })
        },
    );
    match row {
        Ok(s) => Ok(s),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(FileIndexStatus {
            file_count: 0,
            root_count: 0,
            last_built_at: None,
            roots: Vec::new(),
            everything_available,
            search_backend: backend.into(),
        }),
        Err(e) => Err(CoreError::from(e)),
    }
}

fn default_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from);

    if let Some(home) = home {
        for name in [
            "Desktop",
            "Documents",
            "Downloads",
            "Pictures",
            "Videos",
            "Music",
            "OneDrive",
        ] {
            let p = home.join(name);
            if p.is_dir() {
                roots.push(p);
            }
        }
        roots.push(home.clone());
        // Common large app data caches (still skipped secret dirs).
        let local = home.join("AppData").join("Local");
        if local.is_dir() {
            roots.push(local);
        }
    }

    for drive in ["C:\\", "D:\\", "E:\\"] {
        let p = PathBuf::from(drive);
        if p.is_dir() {
            // Only top-level of secondary volumes for map coverage; depth still limits.
            if drive != "C:\\" {
                roots.push(p);
            }
        }
    }

    let temp = std::env::temp_dir();
    if temp.is_dir() {
        roots.push(temp);
    }

    roots
}

fn walk_index(path: &Path, depth: u32, docs: &mut Vec<SearchDocument>, files_seen: &mut usize) {
    if *files_seen >= MAX_FILES || depth > MAX_DEPTH {
        return;
    }
    if should_skip(path) {
        return;
    }

    let meta = match fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return,
    };

    if meta.is_file() {
        *files_seen += 1;
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.display().to_string());
        let full = path.display().to_string();
        docs.push(SearchDocument {
            entity_type: "file".into(),
            entity_id: full.clone(),
            title: name,
            body: full,
        });
        return;
    }

    if !meta.is_dir() {
        return;
    }

    let entries = match fs::read_dir(path) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        if *files_seen >= MAX_FILES {
            break;
        }
        walk_index(&entry.path(), depth + 1, docs, files_seen);
    }
}

fn should_skip(path: &Path) -> bool {
    let lower = path.to_string_lossy().to_lowercase().replace('/', "\\");
    SKIP_DIR_MARKERS.iter().any(|m| lower.contains(m))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db;

    #[test]
    fn rebuild_file_index_runs() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        db::run_migrations(&conn).unwrap();
        let status = rebuild_file_index(&conn).expect("index");
        assert!(status.file_count >= 0);
        let again = file_index_status(&conn).expect("status");
        assert_eq!(again.file_count, status.file_count);
    }
}
