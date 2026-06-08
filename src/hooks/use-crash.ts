/**
 * `useCrash` — custom hook that encapsulates all Crash Intelligence API calls.
 *
 * Components and pages MUST use this hook to interact with crash data.
 * They must NOT import from `src/api/tauri/crash.ts` directly (doc 48 AC-FS-04).
 */

import { useCallback } from 'react';
import {
  getCrashEvents,
  scanCrashEvents as apiScanCrashEvents,
} from '../api/tauri/crash';
import { useCrashStore, type CrashStore } from '../store/crash.store';

export interface UseCrashReturn {
  events: CrashStore['events'];
  scanning: CrashStore['scanning'];
  loading: CrashStore['loading'];
  error: CrashStore['error'];
  /** Load (or reload) the recorded crash-event history. */
  loadCrashEvents: () => Promise<void>;
  /** Scan the OS event log for crashes, then refresh the list. */
  scanCrashEvents: () => Promise<void>;
}

export function useCrash(): UseCrashReturn {
  const {
    events,
    scanning,
    loading,
    error,
    setEvents,
    setScanning,
    setLoading,
    setError,
  } = useCrashStore();

  const loadCrashEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fetched = await getCrashEvents();
      setEvents(fetched);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Failed to load crash events.',
      );
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [setError, setEvents, setLoading]);

  const scanCrashEvents = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const scanned = await apiScanCrashEvents();
      setEvents(scanned);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Failed to scan for crash events.',
      );
    } finally {
      setScanning(false);
    }
  }, [setError, setEvents, setScanning]);

  return {
    events,
    scanning,
    loading,
    error,
    loadCrashEvents,
    scanCrashEvents,
  };
}
