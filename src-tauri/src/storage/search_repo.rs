//! Repository functions for the FTS5 universal search index.
//!
//! All SQLite access for Vision 2.0 search lives here. FTS rebuild clears and
//! repopulates `search_index`; queries return ranked [`SearchHit`]s.

use rusqlite::{params, Connection};

use crate::error::CoreError;
use crate::models::SearchHit;

/// One document to insert into the FTS index.
#[derive(Clone, Debug)]
pub struct SearchDocument {
    /// Entity type slug.
    pub entity_type: String,
    /// Entity identifier.
    pub entity_id: String,
    /// Display title.
    pub title: String,
    /// Body / supporting text.
    pub body: String,
}

/// Clears the entire FTS index.
pub fn clear_index(conn: &Connection) -> Result<(), CoreError> {
    conn.execute("DELETE FROM search_index", [])?;
    Ok(())
}

/// Inserts a batch of documents into the FTS index.
pub fn insert_documents(conn: &Connection, docs: &[SearchDocument]) -> Result<(), CoreError> {
    for doc in docs {
        conn.execute(
            "INSERT INTO search_index (entity_type, entity_id, title, body)
             VALUES (?1, ?2, ?3, ?4)",
            params![doc.entity_type, doc.entity_id, doc.title, doc.body],
        )?;
    }
    Ok(())
}

/// Searches the FTS index. Returns up to `limit` hits ordered by rank.
///
/// Empty or whitespace-only queries return an empty list. Query text is
/// sanitized for FTS5 MATCH (quotes and special chars stripped/escaped).
pub fn search(conn: &Connection, query: &str, limit: i64) -> Result<Vec<SearchHit>, CoreError> {
    let match_query = fts_match_query(query);
    if match_query.is_empty() {
        return Ok(Vec::new());
    }

    let mut stmt = conn.prepare(
        "SELECT entity_type, entity_id, title, body, bm25(search_index) AS rank
         FROM search_index
         WHERE search_index MATCH ?1
         ORDER BY rank
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![match_query, limit], |row| {
        Ok(SearchHit {
            entity_type: row.get(0)?,
            entity_id: row.get(1)?,
            title: row.get(2)?,
            body: row.get(3)?,
            rank: row.get(4)?,
        })
    })?;
    let mut hits = Vec::new();
    for row in rows {
        hits.push(row?);
    }
    Ok(hits)
}

/// Builds a safe FTS5 MATCH query from free-text input.
///
/// Strips FTS special characters and joins remaining tokens with AND so partial
/// multi-word queries work without syntax errors.
fn fts_match_query(query: &str) -> String {
    let tokens: Vec<String> = query
        .split_whitespace()
        .map(|token| {
            token
                .chars()
                .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-' || *c == '.')
                .collect::<String>()
        })
        .filter(|t| !t.is_empty())
        .collect();
    tokens.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db;

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("enable foreign keys");
        db::run_migrations(&conn).expect("run migrations");
        conn
    }

    #[test]
    fn rebuild_and_search_round_trip() {
        let conn = memory_db();
        clear_index(&conn).expect("clear");
        insert_documents(
            &conn,
            &[
                SearchDocument {
                    entity_type: "software".to_string(),
                    entity_id: "s1".to_string(),
                    title: "Visual Studio Code".to_string(),
                    body: "Microsoft editor".to_string(),
                },
                SearchDocument {
                    entity_type: "crash".to_string(),
                    entity_id: "c1".to_string(),
                    title: "Application crash".to_string(),
                    body: "chrome.exe failed".to_string(),
                },
            ],
        )
        .expect("insert");

        let hits = search(&conn, "Visual Studio", 10).expect("search");
        assert!(!hits.is_empty());
        assert_eq!(hits[0].entity_id, "s1");

        let empty = search(&conn, "   ", 10).expect("empty query");
        assert!(empty.is_empty());
    }

    #[test]
    fn fts_match_query_strips_specials() {
        assert_eq!(fts_match_query("hello world"), "hello world");
        assert_eq!(fts_match_query("foo\" OR bar"), "foo OR bar");
        assert!(fts_match_query("   ").is_empty());
    }
}
