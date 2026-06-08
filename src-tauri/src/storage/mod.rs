//! On-device SQLite storage layer.
//!
//! Owns all database read/write operations and the migration runner. No
//! business logic or collector I/O lives here (see doc 48 §4.1).

pub mod alerts_repo;
pub mod crash_repo;
pub mod db;
pub mod device_repo;
pub mod diagnosis_repo;
pub mod health_repo;
pub mod restore_repo;
pub mod sync_repo;
pub mod timeline_repo;
