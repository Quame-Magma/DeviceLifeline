import { useCallback, useState } from 'react';
import {
  applySoftwareUpdates as apiApply,
  listSoftwareUpdates as apiList,
  scanSoftwareUpdates as apiScan,
} from '../api/tauri/updates';
import type { SoftwareUpdate, UpdateApplyResult } from '../types/device.types';

function toMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

export function useUpdates() {
  const [updates, setUpdates] = useState<SoftwareUpdate[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<UpdateApplyResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUpdates(await apiList());
    } catch (err) {
      setError(toMessage(err, 'Failed to list updates.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUpdates(await apiScan());
    } catch (err) {
      setError(toMessage(err, 'Failed to scan for updates.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const apply = useCallback(async (ids: string[], confirm: boolean) => {
    setApplying(true);
    setError(null);
    try {
      const result = await apiApply(ids, confirm);
      setLastResult(result);
      setUpdates(await apiList());
      return result;
    } catch (err) {
      setError(toMessage(err, 'Failed to apply updates.'));
      return null;
    } finally {
      setApplying(false);
    }
  }, []);

  return {
    updates,
    loading,
    applying,
    error,
    lastResult,
    load,
    scan,
    apply,
  };
}
