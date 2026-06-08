/**
 * Pure helpers for cloud-sync status display. No React, no side effects.
 */

import type { SyncStatus } from '../types/device.types';

/**
 * Builds a short human-readable label for the sync status.
 *
 * @example syncStatusLabel({ configured: false, pending: 3, synced: 0, failed: 0 })
 *   // 'Not configured — 3 items queued locally'
 */
export function syncStatusLabel(status: SyncStatus): string {
  if (!status.configured) {
    if (status.pending > 0) {
      const noun = status.pending === 1 ? 'item' : 'items';
      return `Not configured — ${status.pending} ${noun} queued locally`;
    }
    return 'Not configured';
  }
  if (status.pending > 0) {
    return `${status.pending} pending`;
  }
  return 'Up to date';
}
