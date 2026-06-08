//! On-device SQLite storage layer.
//!
//! Owns all database read/write operations and the migration runner. No
//! business logic or collector I/O lives here (see doc 48 §4.1).

pub mod db;
pub mod device_repo;
pub mod timeline_repo;
