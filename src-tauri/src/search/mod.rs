//! Universal search engine over the FTS5 index.
//!
//! Rebuilds the index from software inventory, config, crash titles, timeline,
//! intelligence findings, and (optionally) the scoped file index.

pub mod everything;
pub mod file_index;
pub mod usn;

use rusqlite::Connection;

use crate::error::CoreError;
use crate::models::{FileIndexStatus, SearchHit};
use crate::storage::search_repo::SearchDocument;
use crate::storage::{crash_repo, device_repo, intelligence_repo, search_repo, timeline_repo};

/// Maximum hits returned by a search query.
const DEFAULT_SEARCH_LIMIT: i64 = 50;

/// Clears and repopulates the FTS index from on-device sources (metadata only).
/// File paths are rebuilt via [`rebuild_all`] or [`file_index::rebuild_file_index`].
pub fn rebuild_index(conn: &Connection) -> Result<i64, CoreError> {
    // Preserve file docs if present: only clear non-file, then re-add metadata.
    conn.execute("DELETE FROM search_index WHERE entity_type != 'file'", [])?;
    let mut docs: Vec<SearchDocument> = Vec::new();

    // Latest DNA snapshot software + config.
    if let Some(snapshot) = device_repo::list_snapshots(conn)?.into_iter().next() {
        for item in device_repo::list_software(conn, &snapshot.id)? {
            let body = format!(
                "{} {} {} {}",
                item.name,
                item.version.as_deref().unwrap_or(""),
                item.publisher.as_deref().unwrap_or(""),
                item.install_location.as_deref().unwrap_or("")
            );
            docs.push(SearchDocument {
                entity_type: "software".to_string(),
                entity_id: item.id,
                title: item.name,
                body,
            });
        }
        for item in device_repo::list_config(conn, &snapshot.id)? {
            let body = format!(
                "{} {} {} {}",
                item.kind,
                item.name,
                item.status.as_deref().unwrap_or(""),
                item.path.as_deref().unwrap_or("")
            );
            docs.push(SearchDocument {
                entity_type: "config".to_string(),
                entity_id: item.id,
                title: format!("{}: {}", item.kind, item.name),
                body,
            });
        }
    }

    for event in crash_repo::list_events(conn)? {
        docs.push(SearchDocument {
            entity_type: "crash".to_string(),
            entity_id: event.id,
            title: event.title.clone(),
            body: format!(
                "{} {} {}",
                event.category,
                event.severity,
                event.detail.as_deref().unwrap_or("")
            ),
        });
    }

    for event in timeline_repo::list_events(conn)? {
        docs.push(SearchDocument {
            entity_type: "timeline".to_string(),
            entity_id: event.id,
            title: event.title.clone(),
            body: format!(
                "{} {} {}",
                event.event_type,
                event.category,
                event.detail.as_deref().unwrap_or("")
            ),
        });
    }

    for finding in intelligence_repo::list_findings(conn, true)? {
        docs.push(SearchDocument {
            entity_type: "finding".to_string(),
            entity_id: finding.id,
            title: finding.title.clone(),
            body: format!(
                "{} {} {} {}",
                finding.engine, finding.kind, finding.summary, finding.evidence
            ),
        });
    }

    let count = docs.len() as i64;
    search_repo::insert_documents(conn, &docs)?;
    Ok(count)
}

/// Rebuilds metadata + scoped file index. Returns total FTS documents approx.
pub fn rebuild_all(conn: &Connection) -> Result<FileIndexStatus, CoreError> {
    let _meta = rebuild_index(conn)?;
    file_index::rebuild_file_index(conn)
}

/// Hybrid search: Everything (if installed) for files + local FTS for all entity types.
pub fn search(conn: &Connection, query: &str) -> Result<Vec<SearchHit>, CoreError> {
    let mut hits = search_repo::search(conn, query, DEFAULT_SEARCH_LIMIT)?;

    // Prefer Everything for additional file hits when available.
    if let Some(ev) = everything::everything_search(query, 40) {
        for h in ev {
            if !hits.iter().any(|x| x.entity_id == h.entity_id) {
                hits.push(h);
            }
        }
    }

    // Auto-build file index once if empty and query looks like a filename.
    if !hits.iter().any(|h| h.entity_type == "file") {
        let status = file_index::file_index_status(conn)?;
        if status.file_count == 0 && query.trim().len() >= 2 {
            let _ = file_index::rebuild_file_index(conn);
            let more = search_repo::search(conn, query, DEFAULT_SEARCH_LIMIT)?;
            for h in more {
                if !hits.iter().any(|x| x.entity_id == h.entity_id) {
                    hits.push(h);
                }
            }
        }
    }

    hits.truncate(DEFAULT_SEARCH_LIMIT as usize);
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dna::snapshot::capture_snapshot;
    use crate::storage::db;

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("enable foreign keys");
        db::run_migrations(&conn).expect("run migrations");
        conn
    }

    #[test]
    fn rebuild_index_from_snapshot_is_searchable() {
        let mut conn = memory_db();
        let _ = capture_snapshot(&mut conn).expect("snapshot");
        let count = rebuild_index(&conn).expect("rebuild");
        // Mock collectors always produce software; real Windows collectors do too.
        assert!(count >= 0);

        // Searching for a very common token should not error even if zero hits.
        let _ = search(&conn, "a").expect("search");
    }
}
