import { describe, it, expect } from 'vitest';
import { summarize } from './dashboard';
import type {
  CrashEvent,
  DeviceDnaSnapshot,
  HealthAlert,
  HealthSample,
  RestorePlan,
  SyncStatus,
} from '../types/device.types';

const snapshot = (id: string): DeviceDnaSnapshot => ({
  id,
  deviceId: 'd1',
  capturedAt: '2026-06-08T10:00:00Z',
  schemaVersion: 1,
  source: 'manual',
  softwareCount: 6,
  configCount: 3,
});

const alert = (acknowledged: boolean): HealthAlert => ({
  id: Math.random().toString(),
  deviceId: 'd1',
  sampleId: 's1',
  createdAt: '2026-06-08T10:00:00Z',
  kind: 'memory_critical',
  severity: 'critical',
  title: 't',
  detail: 'd',
  value: 95,
  acknowledged,
});

const crash = (severity: string): CrashEvent => ({
  id: Math.random().toString(),
  deviceId: 'd1',
  occurredAt: '2026-06-07T10:00:00Z',
  capturedAt: '2026-06-08T10:00:00Z',
  category: 'app_crash',
  severity,
  source: 'mock',
  title: 't',
  detail: null,
  eventId: 1000,
});

const latestHealth: HealthSample = {
  id: 'h1',
  deviceId: 'd1',
  capturedAt: '2026-06-08T10:00:00Z',
  cpuUsage: 20,
  memoryTotal: 100,
  memoryUsed: 50,
  diskTotal: 100,
  diskUsed: 50,
  diskName: 'C:\\',
  diskCount: 1,
  healthScore: 72,
};

const restorePlan: RestorePlan = {
  id: 'p1',
  deviceId: 'd1',
  snapshotId: 's2',
  name: 'Restore plan',
  createdAt: '2026-06-08T10:05:00Z',
  stepCount: 4,
};

const syncStatus: SyncStatus = {
  configured: false,
  pending: 2,
  synced: 0,
  failed: 0,
};

describe('summarize', () => {
  it('derives counts and the latest snapshot', () => {
    const stats = summarize({
      snapshots: [snapshot('s2'), snapshot('s1')],
      latestHealth,
      alerts: [alert(false), alert(false), alert(true)],
      crashes: [crash('critical'), crash('error'), crash('warning')],
      timelineEvents: [],
      restorePlans: [restorePlan],
      syncStatus,
    });

    expect(stats.snapshotCount).toBe(2);
    expect(stats.latestSnapshot?.id).toBe('s2');
    expect(stats.healthScore).toBe(72);
    expect(stats.activeAlerts).toBe(2);
    expect(stats.crashTotal).toBe(3);
    expect(stats.crashCritical).toBe(1);
    expect(stats.timelineCount).toBe(0);
    expect(stats.restorePlanCount).toBe(1);
    expect(stats.latestRestorePlan?.id).toBe('p1');
    expect(stats.syncStatus?.pending).toBe(2);
    expect(stats.readiness.state).toBe('attention');
    expect(stats.attentionItems.some((item) => item.id === 'critical-crashes')).toBe(
      true,
    );
  });

  it('handles an empty first-run state', () => {
    const stats = summarize({
      snapshots: [],
      latestHealth: null,
      alerts: [],
      crashes: [],
      timelineEvents: [],
    });

    expect(stats.snapshotCount).toBe(0);
    expect(stats.latestSnapshot).toBeNull();
    expect(stats.healthScore).toBeNull();
    expect(stats.activeAlerts).toBe(0);
    expect(stats.crashTotal).toBe(0);
    expect(stats.restorePlanCount).toBe(0);
    expect(stats.readiness.state).toBe('setup');
    expect(stats.attentionItems[0]?.id).toBe('baseline-missing');
  });

  it('marks a complete recovery loop as ready', () => {
    const stats = summarize({
      snapshots: [snapshot('s2')],
      latestHealth: { ...latestHealth, healthScore: 91 },
      alerts: [],
      crashes: [crash('warning')],
      timelineEvents: [],
      restorePlans: [restorePlan],
    });

    expect(stats.readiness.state).toBe('ready');
    expect(stats.readiness.readyChecks).toBe(5);
    expect(stats.attentionItems[0]?.id).toBe('clear');
  });
});
