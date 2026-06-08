//! Database connection setup and the embedded migration runner.
//!
//! Migrations are an ordered list of `(name, sql)` pairs embedded at compile
//! time via [`include_str!`]. The runner is dependency-free and idempotent: it
//! reads `PRAGMA user_version` and applies every migration whose index is `>=`
//! the current version, each inside its own transaction, bumping
//! `user_version` as it goes.

use std::path::Path;

use rusqlite::Connection;

use crate::error::CoreError;

/// Ordered list of `(migration_name, migration_sql)` applied at startup.
///
/// The index of each entry is its version number; after applying entry `i`,
/// `PRAGMA user_version` is set to `i + 1`.
const MIGRATIONS: &[(&str, &str)] = &[
    (
        "0001_init_device_dna",
        include_str!("../../migrations/0001_init_device_dna.sql"),
    ),
    (
        "0002_add_system_config",
        include_str!("../../migrations/0002_add_system_config.sql"),
    ),
];

/// Opens (creating if necessary) the SQLite database at `path`, enables
/// foreign-key enforcement, and runs all pending migrations.
pub fn open(path: &Path) -> Result<Connection, CoreError> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    run_migrations(&conn)?;
    Ok(conn)
}

/// Applies any migrations not yet recorded in `PRAGMA user_version`.
///
/// Each pending migration runs inside a transaction so a failure leaves the
/// database at the last fully-applied version.
pub fn run_migrations(conn: &Connection) -> Result<(), CoreError> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    let current = current.max(0) as usize;

    for (index, (_name, sql)) in MIGRATIONS.iter().enumerate() {
        if index < current {
            continue;
        }
        conn.execute_batch("BEGIN")?;
        match conn.execute_batch(sql) {
            Ok(()) => {
                // user_version does not accept bound parameters; the value is a
                // trusted, in-code index, so formatting it is safe here.
                conn.pragma_update(None, "user_version", (index as i64) + 1)?;
                conn.execute_batch("COMMIT")?;
            }
            Err(err) => {
                conn.execute_batch("ROLLBACK")?;
                return Err(CoreError::Db(err));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn table_exists(conn: &Connection, name: &str) -> bool {
        conn.query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [name],
            |_| Ok(()),
        )
        .is_ok()
    }

    #[test]
    fn migrations_create_tables_and_advance_user_version() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("enable foreign keys");

        run_migrations(&conn).expect("run migrations");

        assert!(table_exists(&conn, "devices"));
        assert!(table_exists(&conn, "device_dna_snapshots"));
        assert!(table_exists(&conn, "software_inventory_items"));
        assert!(table_exists(&conn, "config_items"));

        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read user_version");
        assert_eq!(version, MIGRATIONS.len() as i64);
    }

    #[test]
    fn migrations_are_idempotent() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        run_migrations(&conn).expect("first run");
        run_migrations(&conn).expect("second run is a no-op");

        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read user_version");
        assert_eq!(version, MIGRATIONS.len() as i64);
    }
}
