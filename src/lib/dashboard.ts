/**
 * Pure derivation of Dashboard overview stats from the loaded slice data.
 * No React, no side effects.
 */

import type {
  CrashEvent,
  DeviceDnaSnapshot,
  HealthAlert,
  HealthSample,
  TimelineEvent,
} from '../types/device.types';

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
}

export interface DashboardInput {
  snapshots: DeviceDnaSnapshot[];
  latestHealth: HealthSample | null;
  alerts: HealthAlert[];
  crashes: CrashEvent[];
  timelineEvents: TimelineEvent[];
}

/** Derives the Dashboard overview stats from the loaded slice data. */
export function summarize(input: DashboardInput): DashboardStats {
  return {
    snapshotCount: input.snapshots.length,
    latestSnapshot: input.snapshots[0] ?? null,
    healthScore: input.latestHealth ? input.latestHealth.healthScore : null,
    activeAlerts: input.alerts.filter((alert) => !alert.acknowledged).length,
    crashTotal: input.crashes.length,
    crashCritical: input.crashes.filter((c) => c.severity === 'critical').length,
    timelineCount: input.timelineEvents.length,
  };
}
