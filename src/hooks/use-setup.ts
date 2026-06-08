/**
 * `useSetup` — custom hook for Setup Export / Import IPC calls.
 *
 * Components and pages MUST use this hook to export/import setup bundles.
 * They must NOT import from `src/api/tauri/setup.ts` directly (doc 48 AC-FS-04).
 * State here is transient (in-progress flags + last error), so it is kept in
 * local component state rather than a shared store.
 */

import { useCallback, useState } from 'react';
import {
  exportSetup as apiExportSetup,
  importSetup as apiImportSetup,
} from '../api/tauri/setup';
import type { DeviceDnaSnapshot, SetupBundle } from '../types/device.types';

export interface UseSetupReturn {
  exporting: boolean;
  importing: boolean;
  error: string | null;
  /** Build a bundle for a snapshot; returns null on failure. */
  exportSetup: (snapshotId: string) => Promise<SetupBundle | null>;
  /** Import a bundle JSON; returns the new snapshot, or null on failure. */
  importSetup: (bundleJson: string) => Promise<DeviceDnaSnapshot | null>;
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

export function useSetup(): UseSetupReturn {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportSetup = useCallback(async (snapshotId: string) => {
    setExporting(true);
    setError(null);
    try {
      return await apiExportSetup(snapshotId);
    } catch (err) {
      setError(toMessage(err, 'Failed to export setup.'));
      return null;
    } finally {
      setExporting(false);
    }
  }, []);

  const importSetup = useCallback(async (bundleJson: string) => {
    setImporting(true);
    setError(null);
    try {
      return await apiImportSetup(bundleJson);
    } catch (err) {
      setError(toMessage(err, 'Failed to import setup.'));
      return null;
    } finally {
      setImporting(false);
    }
  }, []);

  return { exporting, importing, error, exportSetup, importSetup };
}
