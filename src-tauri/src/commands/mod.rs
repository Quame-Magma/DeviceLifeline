//! Tauri command handlers.
//!
//! Handlers are thin IPC adapters: they obtain a short-lived DB connection from
//! [`AppState`] and delegate to domain modules. No business SQL lives here.

pub mod agent;
pub mod backup;
pub mod cleanup;
pub mod crash;
pub mod device;
pub mod diagnosis;
pub mod drivers;
pub mod elevation;
pub mod hardware;
pub mod health;
pub mod intelligence;
pub mod process;
pub mod restore;
pub mod search;
pub mod security;
pub mod setup;
pub mod startup;
pub mod storage_engine;
pub mod sync;
pub mod sysreport;
pub mod uninstall;
pub mod updates;
pub mod vault;
