/**
 * Domain type definitions for the Device DNA feature.
 * These interfaces MUST match the Rust serde structs exactly (camelCase via
 * `#[serde(rename_all = "camelCase")]`).
 */

/** A physical or virtual device registered in the system. */
export interface Device {
  id: string;
  hostname: string;
  osName: string;
  osVersion: string;
  createdAt: string;
}

/**
 * A point-in-time snapshot of a device's installed software inventory.
 * `softwareCount` is the number of software items captured in this snapshot.
 * `configCount` is the number of system-configuration items captured.
 */
export interface DeviceDnaSnapshot {
  id: string;
  deviceId: string;
  capturedAt: string;
  schemaVersion: number;
  source: string;
  softwareCount: number;
  configCount: number;
}

/**
 * A single system-configuration item captured in a `DeviceDnaSnapshot`.
 * `kind` includes local MVP environment categories such as "startup",
 * "service", "scheduled_task", "browser_extension", "dev_tool", "hardware",
 * "power", and "network".
 * Optional fields are null when unavailable from the OS source.
 */
export interface ConfigItem {
  id: string;
  snapshotId: string;
  kind: string;
  name: string;
  status: string | null;
  path: string | null;
  publisher: string | null;
  source: string;
}

/**
 * A single software item captured in a `DeviceDnaSnapshot`.
 * Optional fields are null when unavailable from the OS source.
 */
export interface SoftwareInventoryItem {
  id: string;
  snapshotId: string;
  name: string;
  version: string | null;
  publisher: string | null;
  installDate: string | null;
  source: string;
  installLocation: string | null;
}

/**
 * A single timeline event recording a change between two consecutive snapshots.
 * `eventType` ∈ software_install | software_removal | software_update | config_added | config_removed.
 * `category` ∈ software | config.
 */
export interface TimelineEvent {
  id: string;
  deviceId: string;
  snapshotId: string;
  previousSnapshotId: string | null;
  eventType: string;
  category: string;
  title: string;
  detail: string | null;
  occurredAt: string;
}

/**
 * A restore plan generated from a snapshot's software inventory.
 * `stepCount` is the number of install steps in this plan.
 */
export interface RestorePlan {
  id: string;
  deviceId: string;
  snapshotId: string;
  name: string;
  createdAt: string;
  stepCount: number;
}

/**
 * A single step within a `RestorePlan`.
 * `targetVersion` and `wingetId` are null when not available.
 * `source` is the installer source (e.g. "winget").
 */
export interface RestorePlanStep {
  id: string;
  planId: string;
  orderIndex: number;
  softwareName: string;
  targetVersion: string | null;
  wingetId: string | null;
  source: string;
}

/**
 * A restore job that tracks execution of a `RestorePlan`.
 * `status` ∈ running | completed | completed_with_errors | failed.
 * `finishedAt` is null while the job is still running.
 */
export interface RestoreJob {
  id: string;
  planId: string;
  deviceId: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  totalSteps: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
}

/**
 * The result of a single step execution within a `RestoreJob`.
 * `status` ∈ succeeded | failed | skipped.
 * `message` is null for succeeded steps.
 */
export interface RestoreStepResult {
  id: string;
  jobId: string;
  stepId: string;
  softwareName: string;
  status: string;
  message: string | null;
}

/**
 * A point-in-time on-device health reading: CPU, memory, and disk usage at
 * `capturedAt`, plus a derived 0–100 `healthScore` (higher is healthier).
 * `cpuUsage` is a percentage (0–100); memory/disk fields are byte counts.
 */
export interface HealthSample {
  id: string;
  deviceId: string;
  capturedAt: string;
  cpuUsage: number;
  memoryTotal: number;
  memoryUsed: number;
  diskTotal: number;
  diskUsed: number;
  healthScore: number;
}

/**
 * A crash / stability event surfaced by Crash Intelligence, classified from an
 * OS event-log entry. `category` ∈ bsod | app_crash | app_hang | kernel_power |
 * unexpected_shutdown | unknown. `severity` ∈ critical | error | warning.
 */
export interface CrashEvent {
  id: string;
  deviceId: string;
  occurredAt: string;
  capturedAt: string;
  category: string;
  severity: string;
  source: string;
  title: string;
  detail: string | null;
  eventId: number | null;
}

/**
 * A health alert raised when a `HealthSample` reading crosses a threshold.
 * `kind` ∈ memory_critical | disk_low_space | cpu_high. `severity` ∈ critical |
 * warning. `value` is the breaching percentage (0–100).
 */
export interface HealthAlert {
  id: string;
  deviceId: string;
  sampleId: string;
  createdAt: string;
  kind: string;
  severity: string;
  title: string;
  detail: string;
  value: number;
  acknowledged: boolean;
}

/**
 * A portable export of a device setup — a snapshot plus its software inventory
 * and system configuration. `checksum` is a SHA-256 (hex) over the payload,
 * verified on import.
 */
export interface SetupBundle {
  formatVersion: number;
  exportedAt: string;
  sourceHostname: string;
  snapshot: DeviceDnaSnapshot;
  software: SoftwareInventoryItem[];
  config: ConfigItem[];
  checksum: string;
}

/**
 * The on-device context the AI Detective analyzed for a query — structured
 * summaries only (no raw file contents), shown to the user for transparency.
 */
export interface DiagnosisContext {
  healthScore: number | null;
  cpuUsage: number | null;
  memoryPct: number | null;
  diskPct: number | null;
  activeAlertKinds: string[];
  recentCrashCategories: string[];
  recentChangeTitles: string[];
  softwareCount: number;
}

/** A single AI Detective finding: a likely cause with evidence + action. */
export interface DiagnosisFinding {
  id: string;
  sessionId: string;
  orderIndex: number;
  title: string;
  cause: string;
  evidence: string;
  confidence: number;
  suggestedAction: string;
}

/** A single-shot AI Detective diagnosis. Findings are fetched separately. */
export interface DiagnosisSession {
  id: string;
  deviceId: string;
  query: string;
  createdAt: string;
  summary: string;
  context: DiagnosisContext;
  findingCount: number;
}

/**
 * Summary of the local cloud-sync queue. `configured` is false until a Supabase
 * backend is wired up; counts reflect locally queued entities.
 */
export interface SyncStatus {
  configured: boolean;
  pending: number;
  synced: number;
  failed: number;
}
