//! voidtools Everything bridge (when installed).
//!
//! Detects `es.exe` / Everything CLI on PATH or common install paths and runs
//! instant filename queries. Falls back to local FTS when unavailable.

use std::path::{Path, PathBuf};
use std::process::Command;

use crate::models::SearchHit;

/// Returns true when an Everything CLI binary is available.
pub fn everything_available() -> bool {
    find_es_binary().is_some()
}

/// Search via Everything CLI. Returns None if Everything is not available.
pub fn everything_search(query: &str, limit: usize) -> Option<Vec<SearchHit>> {
    let q = query.trim();
    if q.is_empty() {
        return Some(Vec::new());
    }
    let es = find_es_binary()?;
    let limit = limit.clamp(1, 200);

    // es.exe: https://www.voidtools.com/support/everything/command_line_interface/
    // -n max results, -path print full path
    let output = crate::process_win::silent_command(&es)
        .args(["-n", &limit.to_string(), "-path", q])
        .output()
        .ok()?;

    // es returns non-zero when zero results; still parse stdout.
    let text = String::from_utf8_lossy(&output.stdout);
    let mut hits = Vec::new();
    for line in text.lines() {
        let path = line.trim();
        if path.is_empty() {
            continue;
        }
        let name = Path::new(path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string());
        hits.push(SearchHit {
            entity_type: "file".into(),
            entity_id: path.to_string(),
            title: name,
            body: path.to_string(),
            rank: 0.0,
        });
        if hits.len() >= limit {
            break;
        }
    }
    Some(hits)
}

fn find_es_binary() -> Option<PathBuf> {
    // PATH first.
    if let Ok(output) = crate::process_win::silent_command("where")
        .arg("es.exe")
        .output()
    {
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            if let Some(line) = text.lines().next() {
                let p = PathBuf::from(line.trim());
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    // Common install locations.
    let candidates = [
        r"C:\Program Files\Everything\es.exe",
        r"C:\Program Files (x86)\Everything\es.exe",
        r"C:\Program Files\Everything 1.5a\es.exe",
    ];
    for c in candidates {
        let p = PathBuf::from(c);
        if p.is_file() {
            return Some(p);
        }
    }
    // Also try bare `es` on non-Windows (unlikely).
    if cfg!(not(windows)) {
        if let Ok(output) = Command::new("which").arg("es").output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                if let Some(line) = text.lines().next() {
                    return Some(PathBuf::from(line.trim()));
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn everything_search_handles_missing() {
        // Must not panic when Everything is absent.
        let _ = everything_available();
        let _ = everything_search("test", 10);
    }
}
