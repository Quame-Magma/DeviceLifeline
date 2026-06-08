//! Device DNA Engine.
//!
//! Orchestrates snapshot construction: drives a collector, builds the snapshot
//! and its inventory items, and delegates persistence to `storage`. Contains no
//! direct collector I/O details and no SQL (see doc 48 §4.1).

pub mod snapshot;
