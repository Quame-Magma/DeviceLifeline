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

/// A generated plan for restoring a device's software from a snapshot's
/// inventory. Each plan owns an ordered list of [`RestorePlanStep`]s.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RestorePlan {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// Identifier of the [`Device`] this plan targets.
    pub device_id: String,
    /// Identifier of the [`DeviceDnaSnapshot`] the plan was generated from.
    pub snapshot_id: String,
    /// Human-readable plan name.
    pub name: String,
    /// Creation timestamp, RFC3339 / UTC.
    pub created_at: String,
    /// Number of steps in the plan.
    pub step_count: i64,
}

/// One installable step within a [`RestorePlan`], derived from a single
/// [`SoftwareInventoryItem`].
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RestorePlanStep {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// Identifier of the owning [`RestorePlan`].
    pub plan_id: String,
    /// Zero-based position of the step within the plan.
    pub order_index: i64,
    /// Display name of the software to install.
    pub software_name: String,
    /// Target version to install, if known.
    pub target_version: Option<String>,
    /// WinGet package identifier, if resolved (always `None` this cut).
    pub winget_id: Option<String>,
    /// Installer source (currently `"winget"`).
    pub source: String,
}

/// A single execution of a [`RestorePlan`]. Tracks status and per-status tallies
/// across the plan's steps.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RestoreJob {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// Identifier of the [`RestorePlan`] being executed.
    pub plan_id: String,
    /// Identifier of the [`Device`] the job runs against.
    pub device_id: String,
    /// Execution status: `running`, `completed`, `completed_with_errors`, or
    /// `failed`.
    pub status: String,
    /// Start timestamp, RFC3339 / UTC.
    pub started_at: String,
    /// Completion timestamp, RFC3339 / UTC, or `None` while running.
    pub finished_at: Option<String>,
    /// Total number of steps in the executed plan.
    pub total_steps: i64,
    /// Number of steps that succeeded.
    pub succeeded_count: i64,
    /// Number of steps that failed.
    pub failed_count: i64,
    /// Number of steps that were skipped.
    pub skipped_count: i64,
}

/// The outcome of installing a single [`RestorePlanStep`] during a
/// [`RestoreJob`].
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RestoreStepResult {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// Identifier of the owning [`RestoreJob`].
    pub job_id: String,
    /// Identifier of the [`RestorePlanStep`] this result is for.
    pub step_id: String,
    /// Display name of the software (denormalized for convenient listing).
    pub software_name: String,
    /// Result status: `succeeded`, `failed`, or `skipped`.
    pub status: String,
    /// Optional human-readable detail (e.g., an installer error line).
    pub message: Option<String>,
}

/// Internal per-step install outcome returned by an
/// [`Installer`](crate::installer::Installer). Not serialized to the UI; the
/// executor maps it onto a persisted [`RestoreStepResult`].
#[derive(Clone, Debug)]
pub struct StepOutcome {
    /// Result status: `succeeded`, `failed`, or `skipped`.
    pub status: String,
    /// Optional human-readable detail.
    pub message: Option<String>,
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

/// A point-in-time on-device health reading captured by the Health Intelligence
/// sampler: CPU, memory, and disk usage at `captured_at`, plus a derived
/// `0..=100` [`health_score`](Self::health_score) where higher is healthier.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HealthSample {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// Identifier of the [`Device`] this sample was taken on.
    pub device_id: String,
    /// Capture timestamp, RFC3339 / UTC.
    pub captured_at: String,
    /// Overall CPU usage at capture time, as a percentage in `0.0..=100.0`.
    pub cpu_usage: f64,
    /// Total physical memory, in bytes.
    pub memory_total: i64,
    /// Used physical memory, in bytes.
    pub memory_used: i64,
    /// Total space of the primary disk, in bytes (`0` if none was found).
    pub disk_total: i64,
    /// Used space of the primary disk, in bytes.
    pub disk_used: i64,
    /// Derived health score in `0..=100`; higher is healthier.
    pub health_score: i64,
}

/// A crash / stability event surfaced by Crash Intelligence, classified from an
/// OS event-log entry into a plain-English [`category`](Self::category),
/// [`severity`](Self::severity), and [`title`](Self::title).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CrashEvent {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// Identifier of the [`Device`] this event was observed on.
    pub device_id: String,
    /// When the crash/event occurred, RFC3339 / UTC.
    pub occurred_at: String,
    /// When DeviceLifeline recorded the event, RFC3339 / UTC.
    pub captured_at: String,
    /// Classified category: `bsod`, `app_crash`, `app_hang`, `kernel_power`,
    /// `unexpected_shutdown`, or `unknown`.
    pub category: String,
    /// Severity: `critical`, `error`, or `warning`.
    pub severity: String,
    /// Originating event provider name (e.g. `"Application Error"`), or
    /// `"mock"` on non-Windows builds.
    pub source: String,
    /// Plain-English summary line.
    pub title: String,
    /// Plain-English detail / raw event message, if any.
    pub detail: Option<String>,
    /// Windows Event ID, when known.
    pub event_id: Option<i64>,
}

/// Raw crash-collector output prior to classification and persistence. Not
/// exposed over IPC.
#[derive(Clone, Debug)]
pub struct RawCrashEvent {
    /// Event provider / source name (e.g. `"Application Error"`, `"BugCheck"`).
    pub provider: String,
    /// Windows Event ID, when known.
    pub event_id: Option<i64>,
    /// When the event occurred, RFC3339 / UTC.
    pub occurred_at: String,
    /// Raw event message, if any.
    pub message: Option<String>,
}

/// A health alert raised when a [`HealthSample`] reading crosses a predefined
/// threshold (e.g. memory critically high, disk low on space).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HealthAlert {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// Identifier of the [`Device`] this alert was raised on.
    pub device_id: String,
    /// Identifier of the [`HealthSample`] that produced this alert.
    pub sample_id: String,
    /// Creation timestamp, RFC3339 / UTC (the producing sample's time).
    pub created_at: String,
    /// Stable kind slug: `memory_critical`, `disk_low_space`, or `cpu_high`.
    pub kind: String,
    /// Severity slug: `critical` or `warning`.
    pub severity: String,
    /// Plain-English summary line.
    pub title: String,
    /// Plain-English detail line.
    pub detail: String,
    /// The breaching percentage value (`0.0..=100.0`).
    pub value: f64,
    /// Whether the user has acknowledged the alert.
    pub acknowledged: bool,
}

/// A portable export of a device setup — a [`DeviceDnaSnapshot`] plus its
/// software inventory and system configuration — for recreating the setup on
/// another machine. The [`checksum`](Self::checksum) is a SHA-256 (hex) over
/// the serialized payload (snapshot + software + config), verified on import.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SetupBundle {
    /// Bundle format version (currently `1`).
    pub format_version: i64,
    /// Export timestamp, RFC3339 / UTC.
    pub exported_at: String,
    /// Hostname of the device the setup was exported from.
    pub source_hostname: String,
    /// The exported snapshot.
    pub snapshot: DeviceDnaSnapshot,
    /// The snapshot's software inventory.
    pub software: Vec<SoftwareInventoryItem>,
    /// The snapshot's system-configuration items.
    pub config: Vec<ConfigItem>,
    /// SHA-256 (hex) of the serialized payload, for integrity verification.
    pub checksum: String,
}

/// The on-device context summary the AI Detective analyzes for a query. Holds
/// only structured summaries (counts, scores, titles) — never raw file
/// contents — and is shown verbatim to the user for transparency.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosisContext {
    /// Latest HealthScore (0–100), if a sample exists.
    pub health_score: Option<i64>,
    /// Latest CPU usage percentage, if a sample exists.
    pub cpu_usage: Option<f64>,
    /// Latest memory usage percentage, if a sample exists.
    pub memory_pct: Option<f64>,
    /// Latest primary-disk usage percentage, if a sample exists.
    pub disk_pct: Option<f64>,
    /// Kinds of currently-unacknowledged health alerts.
    pub active_alert_kinds: Vec<String>,
    /// Categories of recent crash events.
    pub recent_crash_categories: Vec<String>,
    /// Titles of recent timeline change events.
    pub recent_change_titles: Vec<String>,
    /// Software count from the most recent snapshot.
    pub software_count: i64,
}

/// A single AI Detective finding: a likely cause with supporting evidence, a
/// confidence score, and a suggested action.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosisFinding {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// Identifier of the owning [`DiagnosisSession`].
    pub session_id: String,
    /// Zero-based position of the finding within the session.
    pub order_index: i64,
    /// Plain-English summary of the finding.
    pub title: String,
    /// The likely cause.
    pub cause: String,
    /// Supporting evidence drawn from the device context.
    pub evidence: String,
    /// Confidence score in `0..=100`.
    pub confidence: i64,
    /// Recommended next step.
    pub suggested_action: String,
}

/// A queued entity awaiting upload to the cloud. Not exposed over IPC.
#[derive(Clone, Debug)]
pub struct SyncQueueItem {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// Entity kind: `"snapshot"` or `"health_sample"`.
    pub entity_type: String,
    /// Identifier of the queued entity.
    pub entity_id: String,
    /// When the item was enqueued, RFC3339 / UTC.
    pub created_at: String,
    /// Queue status: `pending`, `synced`, or `failed`.
    pub status: String,
    /// Number of upload attempts made.
    pub attempts: i64,
    /// When the item was synced, RFC3339 / UTC, or `None`.
    pub synced_at: Option<String>,
}

/// A summary of the local cloud-sync queue, surfaced in the UI.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    /// Whether a cloud sync backend is configured (false until Supabase exists).
    pub configured: bool,
    /// Number of items awaiting upload.
    pub pending: i64,
    /// Number of items already synced.
    pub synced: i64,
    /// Number of items that failed to upload.
    pub failed: i64,
}

/// A single-shot AI Detective diagnosis: the user's query, the analyzed
/// [`DiagnosisContext`], a short summary, and the resulting findings (fetched
/// separately by id).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosisSession {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// Identifier of the [`Device`] the diagnosis was run on.
    pub device_id: String,
    /// The user's natural-language query.
    pub query: String,
    /// Creation timestamp, RFC3339 / UTC.
    pub created_at: String,
    /// Short plain-English summary of the outcome.
    pub summary: String,
    /// The on-device context that was analyzed.
    pub context: DiagnosisContext,
    /// Number of findings produced.
    pub finding_count: i64,
}
