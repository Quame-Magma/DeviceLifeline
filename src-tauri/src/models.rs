//! Domain model structs shared across the Rust Core and serialized to the UI.
//!
//! The UI-exposed structs ([`Device`], [`DeviceDnaSnapshot`],
//! [`SoftwareInventoryItem`], [`ConfigItem`]) use
//! `#[serde(rename_all = "camelCase")]` so the JSON the React frontend receives
//! matches the TypeScript interfaces in the implementation contract.
//! [`RawSoftware`] and [`RawConfig`] are the collectors' pre-persistence
//! outputs and are never exposed to the UI.

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
    /// Number of system-configuration items captured in this snapshot.
    pub config_count: i64,
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

/// One system-configuration entry (startup item, service, or scheduled task)
/// belonging to a [`DeviceDnaSnapshot`].
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConfigItem {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// Identifier of the owning [`DeviceDnaSnapshot`].
    pub snapshot_id: String,
    /// Category of the entry: `"startup"`, `"service"`, or `"scheduled_task"`.
    pub kind: String,
    /// Display name of the entry.
    pub name: String,
    /// Status text, if applicable (e.g., service start mode).
    pub status: Option<String>,
    /// Filesystem or command path, if known.
    pub path: Option<String>,
    /// Publisher / vendor, if known.
    pub publisher: Option<String>,
    /// Origin of the entry (`"registry"` or `"mock"`).
    pub source: String,
}

/// A single change event derived from diffing two consecutive
/// [`DeviceDnaSnapshot`]s, surfaced in the Performance Timeline.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEvent {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// Identifier of the [`Device`] this event belongs to.
    pub device_id: String,
    /// Identifier of the newer [`DeviceDnaSnapshot`] that produced the event.
    pub snapshot_id: String,
    /// Identifier of the older snapshot diffed against, if any.
    pub previous_snapshot_id: Option<String>,
    /// Event discriminator: `software_install`, `software_removal`,
    /// `software_update`, `config_added`, or `config_removed`.
    pub event_type: String,
    /// Broad grouping: `software` or `config`.
    pub category: String,
    /// Human-readable summary line.
    pub title: String,
    /// Optional supporting detail (e.g., version transition).
    pub detail: Option<String>,
    /// When the change was observed, RFC3339 / UTC (the newer snapshot's time).
    pub occurred_at: String,
}

/// Raw config collector output prior to persistence. Not exposed over IPC.
#[derive(Clone, Debug)]
pub struct RawConfig {
    /// Category of the entry: `"startup"`, `"service"`, or `"scheduled_task"`.
    pub kind: String,
    /// Display name of the entry.
    pub name: String,
    /// Status text, if applicable (e.g., service start mode).
    pub status: Option<String>,
    /// Filesystem or command path, if known.
    pub path: Option<String>,
    /// Publisher / vendor, if known.
    pub publisher: Option<String>,
    /// Origin of the entry (`"registry"` or `"mock"`).
    pub source: String,
}
