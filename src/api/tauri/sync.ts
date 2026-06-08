/**
 * Typed Tauri IPC wrappers for cloud-sync commands.
 *
 * These are the ONLY entry points for Tauri `invoke` calls related to sync.
 * Components and pages MUST NOT call `invoke` directly (doc 48 AC-FS-04).
 */

import { invoke } from '@tauri-apps/api/core';
import type { SyncStatus } from '../../types/device.types';

/** Retrieve the local cloud-sync queue status. */
export const getSyncStatus = (): Promise<SyncStatus> =>
  invoke<SyncStatus>('get_sync_status');

/** Attempt to drain the sync queue (no-op until configured); returns status. */
export const triggerSync = (): Promise<SyncStatus> =>
  invoke<SyncStatus>('trigger_sync');
