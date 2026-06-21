/**
 * Pure derivation of Dashboard overview stats from the loaded slice data.
 * No React, no side effects.
 */

import type {
  CrashEvent,
  DeviceDnaSnapshot,
  HealthAlert,
  HealthSample,
  RestoreJob,
  RestorePlan,
  SyncStatus,
  TimelineEvent,
} from '../types/device.types';

export type DashboardReadinessState = 'setup' | 'attention' | 'ready';
export type DashboardAttentionSeverity = 'critical' | 'warning' | 'info';

export interface DashboardReadiness {
  state: DashboardReadinessState;
  label: string;
  detail: string;
  readyChecks: number;
  totalChecks: number;
}

export interface DashboardAttentionItem {
  id: string;
  severity: DashboardAttentionSeverity;
  title: string;
  detail: string;
  action: string;
}

export interface DashboardStats {
  /** Number of Device DNA snapshots captured. */
  snapshotCount: number;
  /** The most recent snapshot, or null when none exist. */
  latestSnapshot: DeviceDnaSnapshot | null;
  /** Latest HealthScore (0–100), or null when no sample has been taken. */
  healthScore: number | null;
  /** Number of unacknowledged health alerts. */
  activeAlerts: number;
  /** Total recorded crash events. */
  crashTotal: number;
  /** Number of crash events at critical severity. */
  crashCritical: number;
  /** Number of timeline change events. */
  timelineCount: number;
  /** Number of restore plans currently available. */
  restorePlanCount: number;
  /** The newest restore plan, or null when none exist. */
  latestRestorePlan: RestorePlan | null;
  /** Latest restore job known to the UI, if one has run this session. */
  latestRestoreJob: RestoreJob | null;
  /** Current cloud/local queue status, when loaded. */
  syncStatus: SyncStatus | null;
  /** Recovery-readiness summary derived from the current slices. */
  readiness: DashboardReadiness;
  /** Prioritized next items the user should act on. */
  attentionItems: DashboardAttentionItem[];
  /** Latest timeline events for the overview activity stream. */
  recentTimelineEvents: TimelineEvent[];
}

export interface DashboardInput {
  snapshots: DeviceDnaSnapshot[];
  latestHealth: HealthSample | null;
  alerts: HealthAlert[];
  crashes: CrashEvent[];
  timelineEvents: TimelineEvent[];
  restorePlans?: RestorePlan[];
  latestRestoreJob?: RestoreJob | null;
  syncStatus?: SyncStatus | null;
}

/** Derives the Dashboard overview stats from the loaded slice data. */
export function summarize(input: DashboardInput): DashboardStats {
  const restorePlans = input.restorePlans ?? [];
  const latestSnapshot = input.snapshots[0] ?? null;
  const healthScore = input.latestHealth ? input.latestHealth.healthScore : null;
  const activeAlerts = input.alerts.filter((alert) => !alert.acknowledged).length;
  const crashCritical = input.crashes.filter((c) => c.severity === 'critical').length;
  const syncStatus = input.syncStatus ?? null;

  const attentionItems = buildAttentionItems({
    latestSnapshot,
    healthScore,
    activeAlerts,
    crashCritical,
    restorePlanCount: restorePlans.length,
    syncStatus,
  });

  const readyChecks = [
    latestSnapshot !== null,
    healthScore !== null,
    activeAlerts === 0,
    crashCritical === 0,
    restorePlans.length > 0,
  ].filter(Boolean).length;
  const totalChecks = 5;
  const readiness = deriveReadiness({
    latestSnapshot,
    healthScore,
    activeAlerts,
    crashCritical,
    restorePlanCount: restorePlans.length,
    readyChecks,
    totalChecks,
  });

  return {
    snapshotCount: input.snapshots.length,
    latestSnapshot,
    healthScore,
    activeAlerts,
    crashTotal: input.crashes.length,
    crashCritical,
    timelineCount: input.timelineEvents.length,
    restorePlanCount: restorePlans.length,
    latestRestorePlan: restorePlans[0] ?? null,
    latestRestoreJob: input.latestRestoreJob ?? null,
    syncStatus,
    readiness,
    attentionItems,
    recentTimelineEvents: input.timelineEvents.slice(0, 5),
  };
}

interface AttentionInput {
  latestSnapshot: DeviceDnaSnapshot | null;
  healthScore: number | null;
  activeAlerts: number;
  crashCritical: number;
  restorePlanCount: number;
  syncStatus: SyncStatus | null;
}

function buildAttentionItems(input: AttentionInput): DashboardAttentionItem[] {
  const items: DashboardAttentionItem[] = [];

  if (!input.latestSnapshot) {
    items.push({
      id: 'baseline-missing',
      severity: 'critical',
      title: 'No device baseline yet',
      detail: 'Capture a filtered Device DNA snapshot before testing recovery.',
      action: 'Capture snapshot',
    });
  }

  if (input.healthScore === null) {
    items.push({
      id: 'health-missing',
      severity: 'warning',
      title: 'Health has not been sampled',
      detail: 'Take a local health reading so the overview can flag resource risk.',
      action: 'Sample health',
    });
  } else if (input.activeAlerts > 0) {
    items.push({
      id: 'active-health-alerts',
      severity: 'critical',
      title: `${input.activeAlerts} active health alert${
        input.activeAlerts === 1 ? '' : 's'
      }`,
      detail: 'Acknowledge or investigate current health alerts before a restore rehearsal.',
      action: 'Open health',
    });
  }

  if (input.crashCritical > 0) {
    items.push({
      id: 'critical-crashes',
      severity: 'critical',
      title: `${input.crashCritical} critical crash event${
        input.crashCritical === 1 ? '' : 's'
      }`,
      detail: 'Review recent stability events before treating this machine as recoverable.',
      action: 'Review crashes',
    });
  }

  if (input.latestSnapshot && input.restorePlanCount === 0) {
    items.push({
      id: 'restore-plan-missing',
      severity: 'warning',
      title: 'Restore plan not created',
      detail: 'Generate a dry-run restore plan from the latest baseline.',
      action: 'Create plan',
    });
  }

  if (input.syncStatus && input.syncStatus.failed > 0) {
    items.push({
      id: 'sync-failed',
      severity: 'warning',
      title: `${input.syncStatus.failed} sync item${
        input.syncStatus.failed === 1 ? '' : 's'
      } failed`,
      detail: 'Queued local records are safe, but failed sync items need another attempt.',
      action: 'Retry sync',
    });
  }

  if (items.length === 0) {
    items.push({
      id: 'clear',
      severity: 'info',
      title: 'No blocking attention items',
      detail: 'The local MVP has enough signal for a recovery rehearsal.',
      action: 'Review plan',
    });
  }

  return items;
}

interface ReadinessInput {
  latestSnapshot: DeviceDnaSnapshot | null;
  healthScore: number | null;
  activeAlerts: number;
  crashCritical: number;
  restorePlanCount: number;
  readyChecks: number;
  totalChecks: number;
}

function deriveReadiness(input: ReadinessInput): DashboardReadiness {
  if (!input.latestSnapshot) {
    return {
      state: 'setup',
      label: 'Baseline required',
      detail: 'Capture the first filtered Device DNA snapshot to start MVP testing.',
      readyChecks: input.readyChecks,
      totalChecks: input.totalChecks,
    };
  }

  if (input.activeAlerts > 0 || input.crashCritical > 0) {
    return {
      state: 'attention',
      label: 'Needs attention',
      detail: 'Resolve health or stability warnings before trusting a restore rehearsal.',
      readyChecks: input.readyChecks,
      totalChecks: input.totalChecks,
    };
  }

  if (input.healthScore === null || input.restorePlanCount === 0) {
    return {
      state: 'attention',
      label: 'Almost ready',
      detail: 'Add health signal and a dry-run restore plan to complete the MVP loop.',
      readyChecks: input.readyChecks,
      totalChecks: input.totalChecks,
    };
  }

  return {
    state: 'ready',
    label: 'Ready to test',
    detail: 'Baseline, health, stability, and recovery plan signals are in place.',
    readyChecks: input.readyChecks,
    totalChecks: input.totalChecks,
  };
}
