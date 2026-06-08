import { describe, it, expect } from 'vitest';
import { summarize } from './dashboard';
import type {
  CrashEvent,
  DeviceDnaSnapshot,
  HealthAlert,
  HealthSample,
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
  healthScore: 72,
};

describe('summarize', () => {
  it('derives counts and the latest snapshot', () => {
    const stats = summarize({
      snapshots: [snapshot('s2'), snapshot('s1')],
      latestHealth,
      alerts: [alert(false), alert(false), alert(true)],
      crashes: [crash('critical'), crash('error'), crash('warning')],
      timelineEvents: [],
    });

    expect(stats.snapshotCount).toBe(2);
    expect(stats.latestSnapshot?.id).toBe('s2');
    expect(stats.healthScore).toBe(72);
    expect(stats.activeAlerts).toBe(2);
    expect(stats.crashTotal).toBe(3);
    expect(stats.crashCritical).toBe(1);
    expect(stats.timelineCount).toBe(0);
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
  });
});
