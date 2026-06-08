import { describe, it, expect } from 'vitest';
import { shortId, formatTimestamp } from './format';

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
