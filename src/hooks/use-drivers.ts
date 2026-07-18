/**
 * `useDrivers` - custom hook for Driver Intelligence API calls.
 *
 * Components and pages MUST use this hook to interact with driver data.
 * They must NOT import from `src/api/tauri/drivers.ts` directly.
 */

import { useCallback, useState } from 'react';
import {
  createGpuCleanRestorePoint,
  executeGpuDriverClean,
  listDrivers,
  previewGpuDriverClean,
  scanDrivers as apiScanDrivers,
} from '../api/tauri/drivers';
import type {
  DriverInfo,
  GpuCleanPlan,
  GpuCleanResult,
  VaultEntry,
} from '../types/device.types';

function toMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return fallback;
}

export interface UseDriversReturn {
  drivers: DriverInfo[];
  loading: boolean;
  scanning: boolean;
  cleaning: boolean;
  plan: GpuCleanPlan | null;
  cleanResult: GpuCleanResult | null;
  restorePoint: VaultEntry | null;
  error: string | null;
  message: string | null;
  loadDrivers: () => Promise<void>;
  scan: () => Promise<void>;
  previewClean: (vendor?: string | null) => Promise<void>;
  createRestoreGate: () => Promise<void>;
  executeClean: (confirm: boolean) => Promise<void>;
}

export function useDrivers(): UseDriversReturn {
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [plan, setPlan] = useState<GpuCleanPlan | null>(null);
  const [cleanResult, setCleanResult] = useState<GpuCleanResult | null>(null);
  const [restorePoint, setRestorePoint] = useState<VaultEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadDrivers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listDrivers();
      setDrivers(list);
    } catch (err) {
      setError(toMessage(err, 'Failed to load drivers.'));
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const scan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const list = await apiScanDrivers();
      setDrivers(list);
    } catch (err) {
      setError(toMessage(err, 'Failed to scan drivers.'));
    } finally {
      setScanning(false);
    }
  }, []);

  const previewClean = useCallback(async (vendor?: string | null) => {
    setCleaning(true);
    setError(null);
    setMessage(null);
    setCleanResult(null);
    try {
      const next = await previewGpuDriverClean(vendor);
      setPlan(next);
      setMessage(
        `Preview ready: ${next.targets.length} device(s), ${next.packages.length} package(s).`,
      );
    } catch (err) {
      setError(toMessage(err, 'Failed to preview GPU driver clean.'));
      setPlan(null);
    } finally {
      setCleaning(false);
    }
  }, []);

  const createRestoreGate = useCallback(async () => {
    setCleaning(true);
    setError(null);
    setMessage(null);
    try {
      const entry = await createGpuCleanRestorePoint();
      setRestorePoint(entry);
      if (entry.status === 'completed') {
        setMessage('Restore point created. You may proceed to execute.');
      } else {
        setError(
          entry.detail ??
            'Restore point failed. Enable System Protection and run elevated.',
        );
      }
    } catch (err) {
      setError(toMessage(err, 'Failed to create restore point.'));
      setRestorePoint(null);
    } finally {
      setCleaning(false);
    }
  }, []);

  const executeClean = useCallback(
    async (confirm: boolean) => {
      if (!plan) {
        setError('Run a preview first.');
        return;
      }
      if (!restorePoint || restorePoint.status !== 'completed') {
        setError('Create a successful restore point before execute.');
        return;
      }
      setCleaning(true);
      setError(null);
      setMessage(null);
      try {
        const result = await executeGpuDriverClean({
          planId: plan.id,
          restorePointId: restorePoint.id,
          vendor: plan.vendor,
          confirm,
        });
        setCleanResult(result);
        setMessage(result.message);
        const list = await apiScanDrivers();
        setDrivers(list);
      } catch (err) {
        setError(toMessage(err, 'GPU driver clean failed.'));
      } finally {
        setCleaning(false);
      }
    },
    [plan, restorePoint],
  );

  return {
    drivers,
    loading,
    scanning,
    cleaning,
    plan,
    cleanResult,
    restorePoint,
    error,
    message,
    loadDrivers,
    scan,
    previewClean,
    createRestoreGate,
    executeClean,
  };
}
