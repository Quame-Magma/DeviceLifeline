/**
 * Pure formatting utilities. No React, no side effects.
 */

/**
 * Returns the first 8 characters of a UUID string as a short display ID.
 * Falls back to the full string if shorter than 8 characters.
 *
 * @example shortId('a1b2c3d4-e5f6-...') // 'a1b2c3d4'
 */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

/**
 * Formats an ISO 8601 timestamp string into a human-readable local date/time.
 * Falls back to the raw string if parsing fails.
 *
 * @example formatTimestamp('2026-06-08T14:32:00Z') // 'Jun 8, 2026, 2:32 PM'
 */
export function formatTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Formats a byte count into a human-readable string using binary units
 * (powers of 1024). Whole bytes show no decimal; larger units show one decimal
 * place. Returns '0 B' for zero, negative, or non-finite input.
 *
 * @example formatBytes(512) // '512 B'
 * @example formatBytes(1024) // '1.0 KB'
 * @example formatBytes(16106127360) // '15.0 GB'
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  const formatted = exponent === 0 ? String(value) : value.toFixed(1);
  return `${formatted} ${units[exponent]}`;
}

/**
 * Formats a percentage (0–100) with no decimal places, clamped to 0–100.
 *
 * @example formatPercent(42.7) // '43%'
 * @example formatPercent(150) // '100%'
 */
export function formatPercent(pct: number): string {
  const clamped = Math.min(Math.max(pct, 0), 100);
  return `${Math.round(clamped)}%`;
}
