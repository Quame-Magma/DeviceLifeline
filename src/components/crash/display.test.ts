import { describe, it, expect } from 'vitest';
import { categoryLabel, severityMeta } from './display';

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
