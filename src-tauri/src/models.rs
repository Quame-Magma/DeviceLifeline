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
    /// Category of the entry, such as `"startup"`, `"service"`,
    /// `"scheduled_task"`, `"browser_extension"`, `"dev_tool"`, `"hardware"`,
    /// `"power"`, or `"network"`.
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
    /// Category of the entry, such as `"startup"`, `"service"`,
    /// `"scheduled_task"`, `"browser_extension"`, `"dev_tool"`, `"hardware"`,
    /// `"power"`, or `"network"`.
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
    /// Total space of the most saturated detected disk, in bytes (`0` if none was found).
    pub disk_total: i64,
    /// Used space of the most saturated detected disk, in bytes.
    pub disk_used: i64,
    /// Display name / mount point for the disk that drove disk-pressure scoring.
    pub disk_name: Option<String>,
    /// Number of disks considered for the disk-pressure reading.
    pub disk_count: i64,
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
    /// Latest most-saturated-disk usage percentage, if a sample exists.
    pub disk_pct: Option<f64>,
    /// Kinds of currently-unacknowledged health alerts.
    pub active_alert_kinds: Vec<String>,
    /// Categories of recent crash events.
    pub recent_crash_categories: Vec<String>,
    /// Titles of recent timeline change events.
    pub recent_change_titles: Vec<String>,
    /// Software count from the most recent snapshot.
    pub software_count: i64,
    /// Names of the top memory/CPU processes at diagnosis time.
    #[serde(default)]
    pub top_process_names: Vec<String>,
    /// Combined memory share of the top processes as a percentage, if known.
    #[serde(default)]
    pub top_process_memory_pct: Option<f64>,
    /// Detected query intent slug (e.g. `"slow"`, `"disk"`, `"crash"`).
    #[serde(default)]
    pub query_intent: Option<String>,
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

// ── Vision 2.0 intelligence / process / storage / search models ──────────────

/// A durable intelligence finding produced by a domain engine (process, storage,
/// health, etc.). Distinct from a one-shot [`DiagnosisFinding`].
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IntelligenceFinding {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// Identifier of the [`Device`] this finding belongs to.
    pub device_id: String,
    /// Engine that produced the finding (e.g. `"process"`, `"storage"`, `"system"`).
    pub engine: String,
    /// Stable kind slug (e.g. `"high_memory_process"`, `"temp_bloat"`).
    pub kind: String,
    /// Severity: `info`, `warning`, or `critical`.
    pub severity: String,
    /// Plain-English summary line.
    pub title: String,
    /// Longer plain-English summary.
    pub summary: String,
    /// Supporting evidence string.
    pub evidence: String,
    /// Confidence score in `0..=100`.
    pub confidence: i64,
    /// Recommended next step, if any.
    pub suggested_action: Option<String>,
    /// Linked action-audit id when an action was proposed, if any.
    pub action_id: Option<String>,
    /// Creation timestamp, RFC3339 / UTC.
    pub created_at: String,
    /// Whether the user has dismissed the finding.
    pub dismissed: bool,
}

/// An audited action proposal or execution entry (preview → consent → result).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ActionAudit {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// Identifier of the [`Device`] this action targets.
    pub device_id: String,
    /// Action type slug (e.g. `"safe_cleanup_preview"`).
    pub action_type: String,
    /// Risk tier: `read`, `safe`, `privileged`, or `destructive`.
    pub risk_tier: String,
    /// Plain-English title.
    pub title: String,
    /// Optional supporting detail.
    pub detail: Option<String>,
    /// Status: `proposed`, `previewed`, `running`, `completed`, `failed`, or `cancelled`.
    pub status: String,
    /// Serialized preview payload (what would change), if any.
    pub preview: Option<String>,
    /// Result message after completion, if any.
    pub result_message: Option<String>,
    /// Creation timestamp, RFC3339 / UTC.
    pub created_at: String,
    /// Completion timestamp, RFC3339 / UTC, or `None` while open.
    pub finished_at: Option<String>,
}

/// A long-running background job (scan, rebuild, cleanup, etc.).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundJob {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// Identifier of the [`Device`] this job runs against.
    pub device_id: String,
    /// Job type slug (e.g. `"storage_scan"`, `"search_rebuild"`).
    pub job_type: String,
    /// Status: `queued`, `running`, `completed`, `failed`, or `cancelled`.
    pub status: String,
    /// Progress percentage in `0..=100`.
    pub progress_pct: i64,
    /// Optional status message.
    pub message: Option<String>,
    /// Optional JSON result payload.
    pub result_json: Option<String>,
    /// Creation timestamp, RFC3339 / UTC.
    pub created_at: String,
    /// Last-update timestamp, RFC3339 / UTC.
    pub updated_at: String,
    /// Completion timestamp, RFC3339 / UTC, or `None` while open.
    pub finished_at: Option<String>,
}

/// Live process information with optional risk scoring.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    /// Process id.
    pub pid: u32,
    /// Process display name.
    pub name: String,
    /// CPU usage percentage for the process.
    pub cpu_usage: f64,
    /// Resident memory in bytes.
    pub memory_bytes: u64,
    /// Parent process id, if known.
    pub parent_pid: Option<u32>,
    /// Process status string from the OS sampler.
    pub status: String,
    /// Executable path, if known.
    pub path: Option<String>,
    /// Heuristic risk score in `0..=100`.
    pub risk_score: i64,
    /// Human-readable reasons contributing to the risk score.
    pub risk_reasons: Vec<String>,
    /// Command line, if available.
    #[serde(default)]
    pub cmd: Option<String>,
    /// User name / owner, if available.
    #[serde(default)]
    pub user: Option<String>,
    /// Thread count, if available.
    #[serde(default)]
    pub thread_count: Option<u32>,
    /// Parent process name, if resolved.
    #[serde(default)]
    pub parent_name: Option<String>,
    /// Number of direct children in this snapshot.
    #[serde(default)]
    pub children_count: u32,
    /// Open handle count, if available.
    #[serde(default)]
    pub handle_count: Option<u32>,
    /// Working set / private-ish memory bytes if distinct from memory_bytes.
    #[serde(default)]
    pub working_set_bytes: Option<u64>,
    /// Loaded modules (populated on detail fetch).
    #[serde(default)]
    pub modules: Vec<ProcessModule>,
}

/// A loaded module / DLL for a process.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProcessModule {
    pub name: String,
    pub path: Option<String>,
    pub base_address: Option<String>,
    pub size_bytes: Option<u64>,
}

/// A point-in-time snapshot of running processes.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProcessSnapshot {
    /// Capture timestamp, RFC3339 / UTC.
    pub captured_at: String,
    /// Aggregate CPU usage percentage across the host.
    pub total_cpu: f64,
    /// Aggregate used memory in bytes.
    pub total_memory: u64,
    /// Top processes sorted by memory then CPU (or full list when unlimited).
    pub processes: Vec<ProcessInfo>,
}

/// Process tree node (parent → children) for explorer views.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProcessTreeNode {
    pub process: ProcessInfo,
    pub children: Vec<ProcessTreeNode>,
}

/// Result of a confirmed process termination.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProcessKillResult {
    pub pid: u32,
    pub name: String,
    pub success: bool,
    pub message: String,
    pub action_id: Option<String>,
    /// True when the process tree (/T) was requested.
    #[serde(default)]
    pub tree: bool,
}

/// Windows service inventory row (Process Hacker services tab direction).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ServiceInfo {
    pub name: String,
    pub display_name: String,
    pub status: String,
    pub start_type: Option<String>,
    pub pid: Option<u32>,
    pub path: Option<String>,
    pub account: Option<String>,
}

/// Full process deep detail (Process Hacker parity surface).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProcessDeepDetail {
    pub process: ProcessInfo,
    pub memory_regions: Vec<MemoryRegion>,
    pub wait_chains: Vec<WaitChainNode>,
    pub token: Option<ProcessTokenInfo>,
    pub handles: Vec<ProcessHandle>,
    pub elevated: bool,
    pub notes: Vec<String>,
}

/// Virtual memory region from VirtualQueryEx-style enumeration.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MemoryRegion {
    pub base_address: String,
    pub size_bytes: u64,
    pub state: String,
    pub protect: String,
    pub region_type: String,
}

/// Wait-chain / blocking summary for a thread.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WaitChainNode {
    pub thread_id: u32,
    pub status: String,
    pub wait_reason: Option<String>,
    pub detail: Option<String>,
}

/// Process token / privilege summary.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProcessTokenInfo {
    pub user: Option<String>,
    pub integrity: Option<String>,
    pub elevated: bool,
    pub privileges: Vec<TokenPrivilege>,
}

/// A single token privilege.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TokenPrivilege {
    pub name: String,
    pub enabled: bool,
    pub description: Option<String>,
}

/// Named handle entry for a process.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProcessHandle {
    pub handle: String,
    pub handle_type: String,
    pub name: Option<String>,
    pub access: Option<String>,
}

/// Hierarchical folder size node for storage map (WizTree-style).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StorageFolderNode {
    pub path: String,
    pub name: String,
    pub size_bytes: i64,
    pub file_count: i64,
    pub pct_of_parent: f64,
    pub children: Vec<StorageFolderNode>,
}

/// A mounted logical drive / volume for UI disk pickers.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LogicalDrive {
    /// Mount root used by volume map / VSS (e.g. `C:\`).
    pub name: String,
    /// Volume label when available (e.g. "Windows", "Data").
    pub label: Option<String>,
    pub total_bytes: i64,
    pub available_bytes: i64,
    pub file_system: Option<String>,
    pub is_removable: bool,
}

/// Disk health summary combining SMART / reliability (CrystalDisk-style).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiskHealthSummary {
    pub disk_name: String,
    pub model: Option<String>,
    pub media_type: Option<String>,
    pub health_status: Option<String>,
    pub health_score: i64,
    pub temperature_c: Option<f64>,
    pub power_on_hours: Option<i64>,
    pub wear_pct: Option<f64>,
    pub risk_reasons: Vec<String>,
    /// Named SMART / reliability attributes (id/name/value/raw).
    #[serde(default)]
    pub attributes: Vec<SmartAttribute>,
    pub serial: Option<String>,
    pub size_bytes: Option<i64>,
}

/// One SMART or reliability counter attribute.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SmartAttribute {
    pub id: Option<String>,
    pub name: String,
    pub value: Option<String>,
    pub raw: Option<String>,
    pub worst: Option<String>,
    pub threshold: Option<String>,
    pub status: Option<String>,
}

/// File index rebuild status (Everything-style scoped index).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileIndexStatus {
    pub file_count: i64,
    pub root_count: i64,
    pub last_built_at: Option<String>,
    pub roots: Vec<String>,
    /// Whether voidtools Everything was detected on PATH / common install paths.
    #[serde(default)]
    pub everything_available: bool,
    /// Backend used for last search preference: local_fts | everything | hybrid.
    #[serde(default)]
    pub search_backend: String,
}

/// A storage scan job record.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StorageScan {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// Identifier of the [`Device`] scanned.
    pub device_id: String,
    /// Root path that was scanned.
    pub root_path: String,
    /// Status: `running`, `completed`, or `failed`.
    pub status: String,
    /// Total bytes accounted for among discovered items.
    pub total_bytes: i64,
    /// Number of files discovered.
    pub file_count: i64,
    /// Number of directories discovered.
    pub dir_count: i64,
    /// Creation timestamp, RFC3339 / UTC.
    pub created_at: String,
    /// Completion timestamp, RFC3339 / UTC, or `None` while running.
    pub finished_at: Option<String>,
}

/// A single file or directory discovered during a storage scan.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StorageItem {
    /// Stable unique identifier (UUID v4 string).
    pub id: String,
    /// Identifier of the owning [`StorageScan`].
    pub scan_id: String,
    /// Full filesystem path.
    pub path: String,
    /// Base name of the entry.
    pub name: String,
    /// Kind: `file` or `directory`.
    pub kind: String,
    /// Size in bytes (directory sizes may be aggregated or zero).
    pub size_bytes: i64,
    /// Category: `large_file`, `temp`, `cache`, `media`, `document`, or `other`.
    pub category: String,
    /// Whether the entry is a directory.
    pub is_directory: bool,
}

/// Combined result of a storage scan: the scan row, top items, and findings.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StorageScanResult {
    /// The persisted scan record.
    pub scan: StorageScan,
    /// Top items by size retained from the scan.
    pub items: Vec<StorageItem>,
    /// Intelligence findings produced by the scan.
    pub findings: Vec<IntelligenceFinding>,
}

/// A single hit from the universal FTS search index.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    /// Entity type: `software`, `config`, `crash`, `timeline`, or `finding`.
    pub entity_type: String,
    /// Identifier of the matched entity.
    pub entity_id: String,
    /// Display title.
    pub title: String,
    /// Body snippet / supporting text.
    pub body: String,
    /// FTS rank (higher is more relevant; may be negative depending on bm25).
    pub rank: f64,
}

/// Aggregated intelligence payload for the Vision 2.0 dashboard.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DashboardIntelligence {
    /// Latest HealthScore (0–100), or `0` when no sample exists.
    pub health_score: i64,
    /// Count of unacknowledged health alerts.
    pub active_alerts: i64,
    /// Count of open (non-dismissed) intelligence findings.
    pub open_findings: i64,
    /// Top live processes by memory/CPU.
    pub top_processes: Vec<ProcessInfo>,
    /// Most recent intelligence findings.
    pub recent_findings: Vec<IntelligenceFinding>,
    /// Latest disk pressure percentage, or `0.0` when unknown.
    pub disk_pressure_pct: f64,
    /// Latest CPU usage percentage, or `0.0` when unknown.
    pub cpu_usage: f64,
    /// Latest memory usage percentage, or `0.0` when unknown.
    pub memory_pct: f64,
}

// ── Vision 2.0 hardware / drivers / security / vault ─────────────────────────

/// Point-in-time hardware telemetry (temps, GPU, clocks) plus nested SMART rows.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HardwareSample {
    pub id: String,
    pub device_id: String,
    pub captured_at: String,
    pub cpu_temp_c: Option<f64>,
    pub gpu_temp_c: Option<f64>,
    pub gpu_name: Option<String>,
    pub gpu_usage_pct: Option<f64>,
    pub gpu_vram_used: Option<i64>,
    pub gpu_vram_total: Option<i64>,
    pub cpu_clock_mhz: Option<f64>,
    pub metrics_json: String,
    pub smart: Vec<SmartReading>,
    /// HWiNFO-class live sensor bag (also embedded in `metrics_json`).
    #[serde(default)]
    pub sensors: Vec<SensorReading>,
}

/// One named sensor reading (temp, load, fan, etc.).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SensorReading {
    pub name: String,
    pub value: f64,
    pub unit: String,
    pub source: String,
    /// `cpu` | `gpu` | `disk` | `fan` | `thermal` | `power` | `other`
    pub category: String,
}

/// Live Autoruns-class startup entry.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StartupEntry {
    pub id: String,
    /// `run_key` | `run_once` | `startup_folder` | `scheduled_task` | `service`
    pub category: String,
    pub name: String,
    pub command: Option<String>,
    pub location: String,
    pub enabled: bool,
    /// `user` | `machine`
    pub scope: String,
    pub publisher: Option<String>,
    pub can_toggle: bool,
}

/// Result of enabling/disabling a startup entry.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StartupToggleResult {
    pub entry_id: String,
    pub enabled: bool,
    pub status: String,
    pub message: String,
}

/// GPU package / device targeted by a DDU-class clean preview.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GpuCleanTarget {
    pub name: String,
    pub inf_name: Option<String>,
    pub hardware_id: Option<String>,
    pub manufacturer: Option<String>,
    pub vendor: String,
    /// PnP instance id when known (for device remove).
    #[serde(default)]
    pub instance_id: Option<String>,
}

/// Dry-run plan for guided GPU driver clean.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GpuCleanPlan {
    pub id: String,
    pub vendor: String,
    pub elevated: bool,
    pub targets: Vec<GpuCleanTarget>,
    pub packages: Vec<String>,
    /// Vendor GPU services that will be stopped before package removal.
    #[serde(default)]
    pub services: Vec<String>,
    pub warnings: Vec<String>,
    pub reboot_expected: bool,
    pub dry_run: bool,
    /// When true, execute will also try to schedule a reboot (user still confirms).
    #[serde(default)]
    pub schedule_reboot: bool,
}

/// Outcome of a confirmed GPU driver clean.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GpuCleanResult {
    pub plan_id: String,
    pub status: String,
    pub message: String,
    pub packages_removed: Vec<String>,
    #[serde(default)]
    pub devices_removed: Vec<String>,
    #[serde(default)]
    pub services_stopped: Vec<String>,
    pub restore_point_id: Option<String>,
}

/// SMART / reliability reading for a single disk.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SmartReading {
    pub id: String,
    pub sample_id: String,
    pub disk_name: String,
    pub model: Option<String>,
    pub serial: Option<String>,
    pub media_type: Option<String>,
    pub health_status: Option<String>,
    pub temperature_c: Option<f64>,
    pub power_on_hours: Option<i64>,
    pub wear_pct: Option<f64>,
    pub raw_json: Option<String>,
    #[serde(default)]
    pub size_bytes: Option<i64>,
    #[serde(default)]
    pub attributes: Vec<SmartAttribute>,
}

/// Installed driver / PnP device driver record with health scoring.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DriverInfo {
    pub id: String,
    pub device_id: String,
    pub captured_at: String,
    pub name: String,
    pub device_class: Option<String>,
    pub manufacturer: Option<String>,
    pub driver_version: Option<String>,
    pub driver_date: Option<String>,
    pub signer: Option<String>,
    pub is_signed: bool,
    pub inf_name: Option<String>,
    pub hardware_id: Option<String>,
    pub status: Option<String>,
    pub health_score: i64,
    pub risk_reasons: Vec<String>,
}

/// Behavioral security finding (persistence, privilege, suspicious process).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SecurityFinding {
    pub id: String,
    pub device_id: String,
    pub created_at: String,
    pub category: String,
    pub severity: String,
    pub title: String,
    pub summary: String,
    pub evidence: String,
    pub confidence: i64,
    pub path: Option<String>,
    pub process_name: Option<String>,
    pub dismissed: bool,
}

/// Recovery vault entry: system restore point, DNA vault backup, or disk image job.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VaultEntry {
    pub id: String,
    pub device_id: String,
    pub kind: String,
    pub title: String,
    pub status: String,
    pub detail: Option<String>,
    pub path: Option<String>,
    pub size_bytes: i64,
    pub created_at: String,
    pub metadata_json: String,
}

/// Agent heartbeat from the always-on service or in-process sampler.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AgentHeartbeat {
    pub id: String,
    pub device_id: String,
    pub source: String,
    pub captured_at: String,
    pub status: String,
    pub detail: Option<String>,
}

/// Result of an executed safe cleanup action.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CleanupResult {
    pub action: ActionAudit,
    pub deleted_count: i64,
    pub deleted_bytes: i64,
    pub failed_count: i64,
    pub deleted_paths: Vec<String>,
    /// Candidate paths still found after the cleanup verification scan.
    pub remaining_paths: Vec<String>,
    pub errors: Vec<String>,
    #[serde(default)]
    pub categories_cleaned: Vec<String>,
}

/// One cleanable category (CCleaner/Glary-class).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CleanupCategorySummary {
    pub id: String,
    pub label: String,
    pub description: String,
    pub item_count: i64,
    pub total_bytes: i64,
    pub risk: String,
}

/// One cleanup candidate file/folder entry.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CleanupCandidate {
    pub id: String,
    pub category: String,
    pub path: String,
    pub size_bytes: i64,
    pub is_directory: bool,
}

/// Full cleanup scan preview (dry-run).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CleanupPreview {
    pub scanned_at: String,
    pub categories: Vec<CleanupCategorySummary>,
    pub candidates: Vec<CleanupCandidate>,
    pub total_count: i64,
    pub total_bytes: i64,
    pub dry_run: bool,
}

/// Installed app with uninstall metadata (Revo-class).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub publisher: Option<String>,
    pub install_location: Option<String>,
    pub uninstall_string: Option<String>,
    pub quiet_uninstall_string: Option<String>,
    pub install_date: Option<String>,
    pub estimated_size_kb: Option<i64>,
    pub source: String,
}

/// Leftover path after uninstall.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LeftoverPath {
    pub path: String,
    pub size_bytes: i64,
    pub kind: String,
    pub is_directory: bool,
}

/// Uninstall + leftover scan result.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UninstallScan {
    pub app: InstalledApp,
    pub leftovers: Vec<LeftoverPath>,
    pub total_leftover_bytes: i64,
}

/// Outcome of uninstall or leftover removal.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UninstallResult {
    pub status: String,
    pub message: String,
    pub app_name: String,
    pub leftovers: Vec<LeftoverPath>,
    pub removed_paths: Vec<String>,
}

/// AIDA64-class system inventory section row.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InventoryRow {
    pub section: String,
    pub key: String,
    pub value: String,
}

/// Full system inventory report.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SystemInventoryReport {
    pub captured_at: String,
    pub rows: Vec<InventoryRow>,
    pub software_count: i64,
    pub summary: String,
}

/// Lightweight synthetic benchmark result.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkResult {
    pub kind: String,
    pub label: String,
    pub score: f64,
    pub unit: String,
    pub duration_ms: i64,
    pub detail: String,
}

/// Available third-party software update (Patch My PC–class catalog row).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SoftwareUpdate {
    pub id: String,
    pub device_id: String,
    pub name: String,
    pub winget_id: Option<String>,
    pub publisher: Option<String>,
    pub current_version: Option<String>,
    pub available_version: String,
    pub source: String,
    /// available | planned | installed | failed | skipped
    pub status: String,
    pub detail: Option<String>,
    pub scanned_at: String,
}

/// Result of applying one or more updates.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateApplyResult {
    pub succeeded: Vec<String>,
    pub failed: Vec<UpdateFailure>,
    pub skipped: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFailure {
    pub id: String,
    pub name: String,
    pub message: String,
}

/// Volume Shadow Copy snapshot (Macrium-class volume protection).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VolumeShadow {
    pub id: String,
    pub device_id: String,
    pub shadow_id: String,
    pub volume: String,
    pub device_object: Option<String>,
    pub created_at: String,
    pub status: String,
    pub detail: Option<String>,
}

/// Scheduled volume backup job.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BackupSchedule {
    pub id: String,
    pub device_id: String,
    pub volume: String,
    /// daily | weekly | manual
    pub frequency: String,
    pub enabled: bool,
    pub last_run_at: Option<String>,
    pub next_run_at: Option<String>,
    pub created_at: String,
    pub detail: Option<String>,
}

/// File restore from a VSS shadow result.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ShadowRestoreResult {
    pub success: bool,
    pub source_path: String,
    pub dest_path: String,
    pub message: String,
}

/// Flattened treemap rectangle for WizTree-class visualization.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TreemapCell {
    pub path: String,
    pub name: String,
    pub size_bytes: i64,
    pub file_count: i64,
    pub depth: i64,
    /// 0–1 relative to parent for layout
    pub weight: f64,
}
