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
 * `kind` includes local environment categories such as "startup",
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
 * Disk fields represent the most saturated detected disk, after all reported
 * disks are scanned.
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
  diskName: string | null;
  diskCount: number;
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
  /** Top process names at diagnosis time (Vision 2.0). */
  topProcessNames?: string[];
  /** Combined memory share of top processes, if known. */
  topProcessMemoryPct?: number | null;
  /** Detected query intent (slow, disk, crash, …). */
  queryIntent?: string | null;
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

/**
 * A durable intelligence finding produced by an engine (process, storage, health,
 * crash, etc.). `severity` ∈ critical | warning | info. `confidence` is 0-100.
 * `dismissed` is true when the user has cleared the finding from the feed.
 */
export interface IntelligenceFinding {
  id: string;
  deviceId: string;
  engine: string;
  kind: string;
  severity: string;
  title: string;
  summary: string;
  evidence: string;
  confidence: number;
  suggestedAction: string | null;
  actionId: string | null;
  createdAt: string;
  dismissed: boolean;
}

/**
 * An auditable action record (preview, confirm, result).
 * `riskTier` ∈ read | safe | privileged | destructive.
 * `status` ∈ proposed | confirmed | running | completed | failed | cancelled.
 */
export interface ActionAuditEntry {
  id: string;
  deviceId: string;
  actionType: string;
  riskTier: string;
  title: string;
  detail: string | null;
  status: string;
  preview: string | null;
  resultMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
}

/**
 * Aggregated dashboard intelligence read model from the Vision 2.0 spine.
 */
export interface DashboardIntelligence {
  healthScore: number;
  activeAlerts: number;
  openFindings: number;
  topProcesses: ProcessInfo[];
  recentFindings: IntelligenceFinding[];
  diskPressurePct: number;
  cpuUsage: number;
  memoryPct: number;
}

/**
 * A running (or sampled) process with heuristic risk scoring.
 * `cpuUsage` is a percentage (0-100); `memoryBytes` is RSS-style usage.
 * `riskScore` is 0-100 (higher is riskier).
 */
export interface ProcessInfo {
  pid: number;
  name: string;
  cpuUsage: number;
  memoryBytes: number;
  parentPid: number | null;
  status: string;
  path: string | null;
  riskScore: number;
  riskReasons: string[];
  /** Command line, when available from the OS. */
  cmd?: string | null;
  /** Process owner / user, when available. */
  user?: string | null;
  /** Thread count, when available. */
  threadCount?: number | null;
  /** Resolved parent process name, when available. */
  parentName?: string | null;
  /** Number of direct child processes in the current sample. */
  childrenCount?: number;
  /** Open handle count, when available. */
  handleCount?: number | null;
  /** Working set bytes when distinct from memoryBytes. */
  workingSetBytes?: number | null;
  /** Loaded modules (populated on detail fetch). */
  modules?: ProcessModule[];
}

/** A loaded module / DLL for a process. */
export interface ProcessModule {
  name: string;
  path?: string | null;
  baseAddress?: string | null;
  sizeBytes?: number | null;
}

/**
 * Live process sample returned by `list_processes`.
 */
export interface ProcessSnapshot {
  capturedAt: string;
  totalCpu: number;
  totalMemory: number;
  processes: ProcessInfo[];
}

/** Parent-to-children process tree node for explorer tree views. */
export interface ProcessTreeNode {
  process: ProcessInfo;
  children: ProcessTreeNode[];
}

/** Result of a confirmed process termination. */
export interface ProcessKillResult {
  pid: number;
  name: string;
  success: boolean;
  message: string;
  actionId: string | null;
  /** True when process-tree termination was requested. */
  tree?: boolean;
}

/**
 * Windows service inventory row (Process Explorer services tab).
 */
export interface ServiceInfo {
  name: string;
  displayName: string;
  status: string;
  startType?: string | null;
  pid?: number | null;
  path?: string | null;
  account?: string | null;
}

/** Virtual memory region from VirtualQueryEx-style enumeration. */
export interface MemoryRegion {
  baseAddress: string;
  sizeBytes: number;
  state: string;
  protect: string;
  regionType: string;
}

/** Wait-chain / blocking summary for a thread. */
export interface WaitChainNode {
  threadId: number;
  status: string;
  waitReason?: string | null;
  detail?: string | null;
}

/** A single token privilege. */
export interface TokenPrivilege {
  name: string;
  enabled: boolean;
  description?: string | null;
}

/** Process token / privilege summary. */
export interface ProcessTokenInfo {
  user?: string | null;
  integrity?: string | null;
  elevated: boolean;
  privileges: TokenPrivilege[];
}

/** Named handle entry for a process. */
export interface ProcessHandle {
  handle: string;
  handleType: string;
  name?: string | null;
  access?: string | null;
}

/**
 * Deep process detail: memory map, wait chains, token privileges, named handles.
 * Full results may require running elevated.
 */
export interface ProcessDeepDetail {
  process: ProcessInfo;
  memoryRegions: MemoryRegion[];
  waitChains: WaitChainNode[];
  token: ProcessTokenInfo | null;
  handles: ProcessHandle[];
  elevated: boolean;
  notes: string[];
}

/**
 * A storage scan job covering a root path.
 * `status` ∈ running | completed | failed.
 */
export interface StorageScan {
  id: string;
  deviceId: string;
  rootPath: string;
  status: string;
  totalBytes: number;
  fileCount: number;
  dirCount: number;
  createdAt: string;
  finishedAt: string | null;
}

/**
 * A file or directory discovered during a storage scan.
 * `category` examples: large_file | temp | cache | downloads | media | other.
 */
export interface StorageItem {
  id: string;
  scanId: string;
  path: string;
  name: string;
  kind: string;
  sizeBytes: number;
  category: string;
  isDirectory: boolean;
}

/** Combined result of `scan_storage`: scan row, top items, and findings. */
export interface StorageScanResult {
  scan: StorageScan;
  items: StorageItem[];
  findings: IntelligenceFinding[];
}

/**
 * Hierarchical folder size node for storage map views (WizTree-style).
 * `pctOfParent` is 0-100 relative to the parent node size.
 */
export interface StorageFolderNode {
  path: string;
  name: string;
  sizeBytes: number;
  fileCount: number;
  pctOfParent: number;
  children: StorageFolderNode[];
}

/**
 * Mounted logical drive for disk pickers (volume map, VSS, schedules).
 * `name` is the mount root (e.g. `C:\`).
 */
export interface LogicalDrive {
  name: string;
  label: string | null;
  totalBytes: number;
  availableBytes: number;
  fileSystem: string | null;
  isRemovable: boolean;
}

/**
 * A single hit from universal local search (FTS over findings, software,
 * config, crashes, timeline, and indexed files).
 */
export interface SearchResult {
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  rank: number;
}

/**
 * Status of the scoped filesystem file index used by universal search.
 */
export interface FileIndexStatus {
  fileCount: number;
  rootCount: number;
  lastBuiltAt: string | null;
  roots: string[];
  /** Whether voidtools Everything (es.exe) was detected. */
  everythingAvailable?: boolean;
  /** Backend preference: local_fts | everything | hybrid | usn | hybrid+usn | hybrid+walk. */
  searchBackend?: string;
}

/**
 * Point-in-time hardware telemetry (temps, GPU, clocks) plus nested SMART rows.
 * Optional numeric fields are null when unavailable from the OS source.
 */
export interface HardwareSample {
  id: string;
  deviceId: string;
  capturedAt: string;
  cpuTempC: number | null;
  gpuTempC: number | null;
  gpuName: string | null;
  gpuUsagePct: number | null;
  gpuVramUsed: number | null;
  gpuVramTotal: number | null;
  cpuClockMhz: number | null;
  metricsJson: string;
  smart: SmartReading[];
  /** HWiNFO-class sensor bag (also embedded in metricsJson). */
  sensors?: SensorReading[];
}

/** One named sensor reading for the Sensors panel. */
export interface SensorReading {
  name: string;
  value: number;
  unit: string;
  source: string;
  category: string;
}

/** Autoruns-class live startup entry. */
export interface StartupEntry {
  id: string;
  category: string;
  name: string;
  command: string | null;
  location: string;
  enabled: boolean;
  scope: string;
  publisher: string | null;
  canToggle: boolean;
}

export interface StartupToggleResult {
  entryId: string;
  enabled: boolean;
  status: string;
  message: string;
}

/** DDU-class GPU clean target package/device. */
export interface GpuCleanTarget {
  name: string;
  infName: string | null;
  hardwareId: string | null;
  manufacturer: string | null;
  vendor: string;
  instanceId?: string | null;
}

export interface GpuCleanPlan {
  id: string;
  vendor: string;
  elevated: boolean;
  targets: GpuCleanTarget[];
  packages: string[];
  services?: string[];
  warnings: string[];
  rebootExpected: boolean;
  dryRun: boolean;
  scheduleReboot?: boolean;
}

export interface GpuCleanResult {
  planId: string;
  status: string;
  message: string;
  packagesRemoved: string[];
  devicesRemoved?: string[];
  servicesStopped?: string[];
  restorePointId: string | null;
}

/**
 * SMART / reliability reading for a single disk attached to a hardware sample.
 */
export interface SmartReading {
  id: string;
  sampleId: string;
  diskName: string;
  model: string | null;
  serial: string | null;
  mediaType: string | null;
  healthStatus: string | null;
  temperatureC: number | null;
  powerOnHours: number | null;
  wearPct: number | null;
  rawJson: string | null;
}

/**
 * One SMART or reliability counter attribute.
 */
export interface SmartAttribute {
  id?: string | null;
  name: string;
  value?: string | null;
  raw?: string | null;
  worst?: string | null;
  threshold?: string | null;
  status?: string | null;
}

/**
 * Disk health summary combining SMART / reliability signals (CrystalDisk-style).
 * `healthScore` is 0-100 (higher is healthier).
 */
export interface DiskHealthSummary {
  diskName: string;
  model: string | null;
  mediaType: string | null;
  healthStatus: string | null;
  healthScore: number;
  temperatureC: number | null;
  powerOnHours: number | null;
  wearPct: number | null;
  riskReasons: string[];
  /** Named SMART / reliability attributes. */
  attributes: SmartAttribute[];
  serial?: string | null;
  sizeBytes?: number | null;
}

/**
 * Installed driver / PnP device driver record with health scoring.
 * `healthScore` is 0–100 (higher is healthier). `riskReasons` explains deductions.
 */
export interface DriverInfo {
  id: string;
  deviceId: string;
  capturedAt: string;
  name: string;
  deviceClass: string | null;
  manufacturer: string | null;
  driverVersion: string | null;
  driverDate: string | null;
  signer: string | null;
  isSigned: boolean;
  infName: string | null;
  hardwareId: string | null;
  status: string | null;
  healthScore: number;
  riskReasons: string[];
}

/** Driver package offered by Windows Update (Type=Driver). */
export interface DriverUpdate {
  id: string;
  revision: number;
  title: string;
  description: string | null;
  kbArticle: string | null;
  manufacturer: string | null;
  driverClass: string | null;
  provider: string | null;
  version: string | null;
  hardwareId: string | null;
  sizeBytes: number;
  isDownloaded: boolean;
  categories: string[];
}

export interface DriverUpdateScanResult {
  scannedAt: string;
  updates: DriverUpdate[];
  totalCount: number;
  totalBytes: number;
  warnings: string[];
}

export interface DriverUpdateFailure {
  id: string;
  title: string;
  message: string;
}

export interface DriverUpdateInstallResult {
  attempted: number;
  succeeded: string[];
  failed: DriverUpdateFailure[];
  rebootRequired: boolean;
  message: string;
}

/**
 * Behavioral security finding (persistence, privilege, suspicious process).
 * `severity` ∈ critical | warning | info. `confidence` is 0–100.
 */
export interface SecurityFinding {
  id: string;
  deviceId: string;
  createdAt: string;
  category: string;
  severity: string;
  title: string;
  summary: string;
  evidence: string;
  confidence: number;
  path: string | null;
  processName: string | null;
  dismissed: boolean;
}

/**
 * Recovery vault entry: system restore point, DNA vault backup, or directory image.
 * `status` ∈ pending | completed | failed | running (engine-specific).
 */
export interface VaultEntry {
  id: string;
  deviceId: string;
  kind: string;
  title: string;
  status: string;
  detail: string | null;
  path: string | null;
  sizeBytes: number;
  createdAt: string;
  metadataJson: string;
}

/**
 * Agent heartbeat from the always-on service or in-process sampler.
 * `source` examples: agent_service | ui_process. `status` examples: running | idle.
 */
export interface AgentHeartbeat {
  id: string;
  deviceId: string;
  source: string;
  capturedAt: string;
  status: string;
  detail: string | null;
}

/**
 * Result of an executed safe cleanup action (temp/cache only).
 */
export interface CleanupResult {
  action: ActionAuditEntry;
  deletedCount: number;
  deletedBytes: number;
  failedCount: number;
  deletedPaths: string[];
  /** Candidate paths still found after the cleanup verification scan. */
  remainingPaths: string[];
  errors: string[];
  categoriesCleaned?: string[];
}

export interface CleanupCategorySummary {
  id: string;
  label: string;
  description: string;
  itemCount: number;
  totalBytes: number;
  risk: string;
}

export interface CleanupCandidate {
  id: string;
  category: string;
  path: string;
  sizeBytes: number;
  isDirectory: boolean;
}

export interface CleanupPreview {
  scannedAt: string;
  categories: CleanupCategorySummary[];
  candidates: CleanupCandidate[];
  totalCount: number;
  totalBytes: number;
  dryRun: boolean;
}

export interface InstalledApp {
  id: string;
  name: string;
  version: string | null;
  publisher: string | null;
  installLocation: string | null;
  uninstallString: string | null;
  quietUninstallString: string | null;
  installDate: string | null;
  estimatedSizeKb: number | null;
  source: string;
}

export interface LeftoverPath {
  path: string;
  sizeBytes: number;
  kind: string;
  isDirectory: boolean;
}

export interface UninstallScan {
  app: InstalledApp;
  leftovers: LeftoverPath[];
  totalLeftoverBytes: number;
}

export interface UninstallResult {
  status: string;
  message: string;
  appName: string;
  leftovers: LeftoverPath[];
  removedPaths: string[];
}

export interface InventoryRow {
  section: string;
  key: string;
  value: string;
}

export interface SystemInventoryReport {
  capturedAt: string;
  rows: InventoryRow[];
  softwareCount: number;
  summary: string;
}

export interface BenchmarkResult {
  kind: string;
  label: string;
  score: number;
  unit: string;
  durationMs: number;
  detail: string;
}

/**
 * Copilot / diagnosis provider status (local Qwen3 only).
 * When `llmConfigured` is false, answers use the on-device heuristic provider.
 * Cloud providers (OpenAI / xAI / Gemini) are not supported.
 */
export interface CopilotStatus {
  llmConfigured: boolean;
  provider: string;
  /** Providers available on this device (typically `local-qwen3` or empty). */
  availableProviders?: string[];
  model: string;
  local?: {
    provider: string;
    model: string;
    endpoint: string;
    modelPath: string | null;
    runtimePath: string | null;
    modelInstalled: boolean;
    runtimeInstalled: boolean;
    ready: boolean;
    modelDownloadUrl: string;
    runtimeDownloadUrl: string;
    /** idle | downloading_* | extracting_* | verifying | ready | error */
    installPhase?: string;
    installPercent?: number;
    installMessage?: string;
    installError?: string | null;
    installBusy?: boolean;
  };
}

/** Progress of in-app local Qwen3 install. */
export interface LocalQwenInstallProgress {
  phase: string;
  percent: number;
  message: string;
  error: string | null;
  busy: boolean;
}

/** Patch My PC–class third-party update row. */
export interface SoftwareUpdate {
  id: string;
  deviceId: string;
  name: string;
  wingetId: string | null;
  publisher: string | null;
  currentVersion: string | null;
  availableVersion: string;
  source: string;
  status: string;
  detail: string | null;
  scannedAt: string;
}

export interface UpdateFailure {
  id: string;
  name: string;
  message: string;
}

export interface UpdateApplyResult {
  succeeded: string[];
  failed: UpdateFailure[];
  skipped: string[];
}

/** Macrium-class volume shadow copy. */
export interface VolumeShadow {
  id: string;
  deviceId: string;
  shadowId: string;
  volume: string;
  deviceObject: string | null;
  createdAt: string;
  status: string;
  detail: string | null;
}

/** Scheduled volume checkpoint. */
export interface BackupSchedule {
  id: string;
  deviceId: string;
  volume: string;
  frequency: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  detail: string | null;
}

export interface ShadowRestoreResult {
  success: boolean;
  sourcePath: string;
  destPath: string;
  message: string;
}
