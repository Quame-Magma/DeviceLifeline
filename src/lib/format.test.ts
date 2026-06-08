import { describe, it, expect } from 'vitest';
import {
  shortId,
  formatTimestamp,
  formatBytes,
  formatPercent,
} from './format';

describe('shortId', () => {
  it('returns the first 8 characters of a UUID', () => {
    expect(shortId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('a1b2c3d4');
  });

  it('returns the full string when shorter than 8 characters', () => {
    expect(shortId('abc')).toBe('abc');
  });

  it('handles an exactly 8-character string', () => {
    expect(shortId('12345678')).toBe('12345678');
  });

  it('handles an empty string without throwing', () => {
    expect(shortId('')).toBe('');
  });
});

describe('formatTimestamp', () => {
  it('returns a non-empty string for a valid ISO timestamp', () => {
    const result = formatTimestamp('2026-06-08T14:32:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // The year should appear in the output
    expect(result).toContain('2026');
  });

  it('returns the raw string when given an invalid date', () => {
    const invalid = 'not-a-date';
    const result = formatTimestamp(invalid);
    // Should fall back to the raw string rather than throwing.
    expect(result).toBe(invalid);
  });

  it('handles a UTC-midnight timestamp without throwing', () => {
    expect(() => formatTimestamp('2026-01-01T00:00:00.000Z')).not.toThrow();
  });
});

describe('formatBytes', () => {
  it('returns "0 B" for zero', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('returns "0 B" for negative or non-finite input', () => {
    expect(formatBytes(-100)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
  });

  it('formats whole bytes without a decimal', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats kilobytes with one decimal', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes and gigabytes', () => {
    expect(formatBytes(1024 ** 2)).toBe('1.0 MB');
    expect(formatBytes(16106127360)).toBe('15.0 GB');
  });
});

describe('formatPercent', () => {
  it('rounds to a whole percent', () => {
    expect(formatPercent(42.7)).toBe('43%');
    expect(formatPercent(0)).toBe('0%');
  });

  it('clamps out-of-range values to 0–100', () => {
    expect(formatPercent(150)).toBe('100%');
    expect(formatPercent(-10)).toBe('0%');
  });
});
