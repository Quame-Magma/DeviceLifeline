import { describe, it, expect } from 'vitest';
import { categoryLabel, explainCrashEvent, severityMeta } from './display';
import type { CrashEvent } from '../../types/device.types';

describe('categoryLabel', () => {
  it('maps known categories to readable labels', () => {
    expect(categoryLabel('bsod')).toBe('Blue screen (BSOD)');
    expect(categoryLabel('app_crash')).toBe('App crash');
    expect(categoryLabel('kernel_power')).toBe('Power / kernel');
  });

  it('falls back to "Other" for unknown categories', () => {
    expect(categoryLabel('something_else')).toBe('Other');
  });
});

describe('severityMeta', () => {
  it('returns label and rank for known severities', () => {
    expect(severityMeta('critical').label).toBe('Critical');
    expect(severityMeta('critical').rank).toBe(0);
    expect(severityMeta('error').rank).toBe(1);
    expect(severityMeta('warning').rank).toBe(2);
  });

  it('falls back for an unknown severity', () => {
    const meta = severityMeta('weird');
    expect(meta.label).toBe('weird');
    expect(meta.rank).toBe(3);
  });
});

describe('explainCrashEvent', () => {
  const baseEvent: CrashEvent = {
    id: 'e1',
    deviceId: 'd1',
    occurredAt: '2026-06-07T03:12:45Z',
    capturedAt: '2026-06-08T00:00:00Z',
    category: 'app_crash',
    severity: 'error',
    source: 'Application Error',
    title: 'Application crash',
    detail:
      'Faulting application name: ctfmon.exe, version: 10.0.26100.8521 Faulting module name: Windows.Devices.Lights.dll Exception code: 0xc0000409',
    eventId: 1000,
  };

  it('summarizes app crashes without exposing raw event-log text as the heading', () => {
    const explanation = explainCrashEvent(baseEvent);
    expect(explanation.heading).toBe('ctfmon.exe crashed.');
    expect(explanation.whatHappened).toContain('Windows.Devices.Lights.dll');
    expect(explanation.recommendedAction).toContain('update or repair');
  });

  it('explains kernel power events as unsafe restarts', () => {
    const explanation = explainCrashEvent({
      ...baseEvent,
      category: 'kernel_power',
      severity: 'critical',
      source: 'Microsoft-Windows-Kernel-Power',
      title: 'Unexpected shutdown (power loss or hard reset)',
      detail: null,
      eventId: 41,
    });

    expect(explanation.heading).toContain('restarted');
    expect(explanation.likelyCause).toContain('power');
  });
});
