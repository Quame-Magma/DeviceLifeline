//! Error types for the DeviceLifeline Rust Core.
//!
//! [`CoreError`] is the top-level application error returned by command handlers
//! and the storage/dna layers. [`CollectorError`] is the narrower error type
//! surfaced by OS data collectors and is wrapped into [`CoreError::Collector`].

use serde::{Serialize, Serializer};

/// Errors raised by OS data collectors (e.g., reading the Windows registry).
#[derive(Debug, thiserror::Error)]
pub enum CollectorError {
    /// A platform API call or registry read failed.
    #[error("collector failure: {0}")]
    Source(String),
}

/// Top-level application error for the Rust Core.
///
/// Implements [`serde::Serialize`] (as its [`Display`](std::fmt::Display) string)
/// so it can cross the Tauri IPC boundary and reject the JS promise with a
/// human-readable message.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    /// A SQLite error from `rusqlite`.
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),

    /// An error originating in a data collector.
    #[error("collector error: {0}")]
    Collector(String),

    /// A requested entity could not be found.
    #[error("not found: {0}")]
    NotFound(String),

    /// An unexpected internal error.
    #[error("internal error: {0}")]
    Internal(String),
}

impl From<CollectorError> for CoreError {
    fn from(value: CollectorError) -> Self {
        CoreError::Collector(value.to_string())
    }
}

impl Serialize for CoreError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
