//! On-device SQLite storage layer.
//!
//! Owns all database read/write operations and the migration runner. No
//! business logic or collector I/O lives here (see doc 48 §4.1).

pub mod action_repo;
pub mod agent_repo;
pub mod alerts_repo;
pub mod backup_repo;
pub mod crash_repo;
pub mod db;
pub mod device_repo;
pub mod diagnosis_repo;
pub mod driver_repo;
pub mod hardware_repo;
pub mod health_repo;
pub mod intelligence_repo;
pub mod job_repo;
pub mod pool;
pub mod restore_repo;
pub mod search_repo;
pub mod security_repo;
pub mod storage_repo;
pub mod sync_repo;
pub mod timeline_repo;
pub mod update_repo;
pub mod vault_repo;

pub use pool::DbPool;
