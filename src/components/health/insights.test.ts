import { describe, expect, it } from 'vitest';
import { buildHealthInsight, diskPct, memoryPct } from './insights';
import type { HealthAlert, HealthSample } from '../../types/device.types';

const SAMPLE: HealthSample = {
  id: 'h1',
  deviceId: 'd1',
  capturedAt: '2026-06-21T16:54:00Z',
  cpuUsage: 25,
  memoryTotal: 16,
  memoryUsed: 13.5,
  diskTotal: 500,
  diskUsed: 435,
  healthScore: 29,
};

const ALERTS: HealthAlert[] = [
  {
    id: 'a1',
    deviceId: 'd1',
    sampleId: 'h1',
    createdAt: '2026-06-21T16:54:00Z',
    kind: 'disk_low_space',
    severity: 'critical',
    title: 'Disk is nearly full',
    detail: 'Disk usage is high.',
    value: 87,
    acknowledged: false,
  },
];

describe('health insights', () => {
  it('calculates memory and disk pressure from used and total values', () => {
    expect(memoryPct(SAMPLE)).toBeCloseTo(84.375);
    expect(diskPct(SAMPLE)).toBe(87);
  });

  it('identifies the highest pressure resource and next action', () => {
    const insight = buildHealthInsight(SAMPLE, ALERTS);
    expect(insight.status).toBe('At risk');
    expect(insight.primaryConcern).toContain('Disk');
    expect(insight.recommendedAction).toContain('Free disk space');
    expect(insight.evidence).toContain('1 active alert');
  });
});
