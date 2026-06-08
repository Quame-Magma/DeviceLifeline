//! Domain model structs shared across the Rust Core and serialized to the UI.
//!
//! The three UI-exposed structs ([`Device`], [`DeviceDnaSnapshot`],
//! [`SoftwareInventoryItem`]) use `#[serde(rename_all = "camelCase")]` so the
//! JSON the React frontend receives matches the TypeScript interfaces in the
//! implementation contract. [`RawSoftware`] is the collector's pre-persistence
//! output and is never exposed to the UI.

use serde::{Deserialize, Serialize};

/// A single physical or virtual device tracked by DeviceLifeline.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// Machine hostname.
    pub hostname: String,
    /// Operating system name (e.g., `"windows"`, `"linux"`).
    pub os_name: String,
    /// Operating system version string (may be empty in this increment).
    pub os_version: String,
    /// Creation timestamp, RFC3339 / UTC.
    pub created_at: String,
}

/// A point-in-time Device DNA Snapshot. In this increment it summarizes the
/// installed-software inventory captured at `captured_at`.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DeviceDnaSnapshot {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// Identifier of the [`Device`] this snapshot belongs to.
    pub device_id: String,
    /// Capture timestamp, RFC3339 / UTC.
    pub captured_at: String,
    /// Schema version of the snapshot payload (currently `1`).
    pub schema_version: i64,
    /// How the snapshot was triggered (e.g., `"manual"`).
    pub source: String,
    /// Number of software inventory items captured in this snapshot.
    pub software_count: i64,
}

/// One installed-software entry belonging to a [`DeviceDnaSnapshot`].
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SoftwareInventoryItem {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// Identifier of the owning [`DeviceDnaSnapshot`].
    pub snapshot_id: String,
    /// Display name of the software.
    pub name: String,
    /// Version string, if known.
    pub version: Option<String>,
    /// Publisher / vendor, if known.
    pub publisher: Option<String>,
    /// Install date as reported by the source, if known.
    pub install_date: Option<String>,
    /// Origin of the entry (`"registry"` or `"mock"`).
    pub source: String,
    /// Filesystem install location, if known.
    pub install_location: Option<String>,
}

/// Raw collector output prior to persistence. Not exposed over IPC.
#[derive(Clone, Debug)]
pub struct RawSoftware {
    /// Display name of the software.
    pub name: String,
    /// Version string, if known.
    pub version: Option<String>,
    /// Publisher / vendor, if known.
    pub publisher: Option<String>,
    /// Install date as reported by the source, if known.
    pub install_date: Option<String>,
    /// Filesystem install location, if known.
    pub install_location: Option<String>,
    /// Origin of the entry (`"registry"` or `"mock"`).
    pub source: String,
}
