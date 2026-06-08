/**
 * `useSync` — custom hook for cloud-sync status IPC calls.
 *
 * Components MUST use this hook rather than importing `src/api/tauri/sync.ts`
 * directly (doc 48 AC-FS-04). State is transient (status + flags), so it is kept
 * in local component state rather than a shared store.
 */

import { useCallback, useState } from 'react';
import { getSyncStatus, triggerSync } from '../api/tauri/sync';
import type { SyncStatus } from '../types/device.types';

export interface UseSyncReturn {
  status: SyncStatus | null;
  syncing: boolean;
  error: string | null;
  /** Load (or reload) the sync status. */
  loadStatus: () => Promise<void>;
  /** Trigger a sync attempt, then update the status. */
  sync: () => Promise<void>;
}

function toMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return fallback;
}

export function useSync(): UseSyncReturn {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setError(null);
    try {
      setStatus(await getSyncStatus());
    } catch (err) {
      setError(toMessage(err, 'Failed to load sync status.'));
    }
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      setStatus(await triggerSync());
    } catch (err) {
      setError(toMessage(err, 'Sync failed.'));
    } finally {
      setSyncing(false);
    }
  }, []);

  return { status, syncing, error, loadStatus, sync };
}
