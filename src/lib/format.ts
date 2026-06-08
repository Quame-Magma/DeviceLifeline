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
