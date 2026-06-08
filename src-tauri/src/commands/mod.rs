//! Tauri command handlers.
//!
//! Handlers are thin IPC adapters only: they lock shared state and delegate to
//! `dna` (orchestration) and `storage` (persistence). They contain no business
//! logic and no direct SQL (see doc 48 §4.1, AC-FS-03).

pub mod crash;
pub mod device;
pub mod health;
pub mod restore;
pub mod setup;
