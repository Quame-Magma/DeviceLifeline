//! Short-lived SQLite connection pool.
//!
//! Each [`get`](DbPool::get) opens a connection with WAL + busy timeout so
//! long-running OS I/O never holds a single global mutex across collectors.
//! Migrations run once at pool construction.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::Connection;

use super::db;
use crate::error::CoreError;

/// Connection factory for the on-device SQLite database.
#[derive(Debug)]
pub struct DbPool {
    path: PathBuf,
    /// Serializes first-time open / migration only. Day-to-day gets are parallel.
    bootstrap: Mutex<()>,
}

impl Clone for DbPool {
    fn clone(&self) -> Self {
        Self {
            path: self.path.clone(),
            bootstrap: Mutex::new(()),
        }
    }
}

impl DbPool {
    /// Opens (or creates) the database at `path`, runs migrations, enables WAL.
    pub fn open(path: impl Into<PathBuf>) -> Result<Self, CoreError> {
        let path = path.into();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                CoreError::Internal(format!("create data dir: {e}"))
            })?;
        }
        // Bootstrap migrations once with a dedicated connection.
        {
            let conn = open_configured(&path)?;
            db::run_migrations(&conn)?;
            // Ensure WAL is sticky for subsequent connections.
            let _ = conn.pragma_update(None, "journal_mode", "WAL");
        }
        Ok(Self {
            path,
            bootstrap: Mutex::new(()),
        })
    }

    /// In-memory pool for unit tests (single shared connection via file? uses
    /// a unique temp path under std::env::temp_dir when needed). Prefer
    /// [`open_in_memory`] for pure tests that share one connection.
    pub fn open_in_memory() -> Result<(Self, Connection), CoreError> {
        let conn = Connection::open_in_memory()?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        db::run_migrations(&conn)?;
        // Path is unused when tests hold the Connection directly; still valid.
        let pool = Self {
            path: PathBuf::from(":memory:"),
            bootstrap: Mutex::new(()),
        };
        Ok((pool, conn))
    }

    /// Path to the database file.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Opens a short-lived connection. Caller should drop it promptly after SQL.
    pub fn get(&self) -> Result<Connection, CoreError> {
        if self.path == Path::new(":memory:") {
            return Err(CoreError::Internal(
                "in-memory DbPool cannot open additional connections; use the bootstrap Connection in tests"
                    .into(),
            ));
        }
        let _guard = self.bootstrap.lock().ok();
        open_configured(&self.path)
    }
}

fn open_configured(path: &Path) -> Result<Connection, CoreError> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    // WAL allows concurrent readers with a single writer without long exclusive locks.
    let _ = conn.pragma_update(None, "journal_mode", "WAL");
    let _ = conn.pragma_update(None, "synchronous", "NORMAL");
    // Wait up to 5s if another connection is writing.
    conn.busy_timeout(std::time::Duration::from_millis(5_000))?;
    Ok(conn)
}

/// Opens a path with migrations (legacy helper used by tests and agent).
pub fn open(path: &Path) -> Result<Connection, CoreError> {
    db::open(path)
}
