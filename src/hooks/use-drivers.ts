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
  installDriverUpdates as apiInstallDriverUpdates,
  listDrivers,
  previewGpuDriverClean,
  scanDriverUpdates as apiScanDriverUpdates,
  scanDrivers as apiScanDrivers,
} from '../api/tauri/drivers';
import type {
  DriverInfo,
  DriverUpdate,
  DriverUpdateInstallResult,
  DriverUpdateScanResult,
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
  /** Searching Windows Update for driver packages. */
  updateScanning: boolean;
  /** Installing selected driver updates. */
  updateInstalling: boolean;
  plan: GpuCleanPlan | null;
  cleanResult: GpuCleanResult | null;
  restorePoint: VaultEntry | null;
  updateScan: DriverUpdateScanResult | null;
  availableUpdates: DriverUpdate[];
  updateInstallResult: DriverUpdateInstallResult | null;
  error: string | null;
  message: string | null;
  loadDrivers: () => Promise<void>;
  scan: () => Promise<void>;
  scanUpdates: () => Promise<void>;
  installUpdates: (updateIds: string[], confirm: boolean) => Promise<void>;
  previewClean: (vendor?: string | null) => Promise<void>;
  createRestoreGate: () => Promise<void>;
  executeClean: (confirm: boolean) => Promise<void>;
}

export function useDrivers(): UseDriversReturn {
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [updateScanning, setUpdateScanning] = useState(false);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [plan, setPlan] = useState<GpuCleanPlan | null>(null);
  const [cleanResult, setCleanResult] = useState<GpuCleanResult | null>(null);
  const [restorePoint, setRestorePoint] = useState<VaultEntry | null>(null);
  const [updateScan, setUpdateScan] = useState<DriverUpdateScanResult | null>(
    null,
  );
  const [updateInstallResult, setUpdateInstallResult] =
    useState<DriverUpdateInstallResult | null>(null);
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
      setMessage(`Scanned ${list.length} driver(s).`);
    } catch (err) {
      setError(toMessage(err, 'Failed to scan drivers.'));
    } finally {
      setScanning(false);
    }
  }, []);

  const scanUpdates = useCallback(async () => {
    setUpdateScanning(true);
    setError(null);
    setMessage(null);
    setUpdateInstallResult(null);
    try {
      const result = await apiScanDriverUpdates();
      setUpdateScan(result);
      if (result.warnings?.length) {
        setMessage(result.warnings[0]);
      } else if (result.totalCount === 0) {
        setMessage('No driver updates found via Windows Update.');
      } else {
        setMessage(
          `Found ${result.totalCount} driver update(s) from Windows Update.`,
        );
      }
    } catch (err) {
      setError(toMessage(err, 'Failed to scan for driver updates.'));
      setUpdateScan(null);
    } finally {
      setUpdateScanning(false);
    }
  }, []);

  const installUpdates = useCallback(
    async (updateIds: string[], confirm: boolean) => {
      if (updateIds.length === 0) {
        setError('Select at least one driver update.');
        return;
      }
      setUpdateInstalling(true);
      setError(null);
      setMessage(null);
      try {
        const result = await apiInstallDriverUpdates(updateIds, confirm);
        setUpdateInstallResult(result);
        setMessage(result.message);
        if (result.failed.length > 0 && result.succeeded.length === 0) {
          setError(result.failed[0]?.message ?? result.message);
        }
        // Refresh inventory + available list after install.
        const list = await apiScanDrivers();
        setDrivers(list);
        try {
          const next = await apiScanDriverUpdates();
          setUpdateScan(next);
        } catch {
          /* keep previous update list if re-scan fails */
        }
      } catch (err) {
        setError(toMessage(err, 'Failed to install driver updates.'));
      } finally {
        setUpdateInstalling(false);
      }
    },
    [],
  );

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
    updateScanning,
    updateInstalling,
    plan,
    cleanResult,
    restorePoint,
    updateScan,
    availableUpdates: updateScan?.updates ?? [],
    updateInstallResult,
    error,
    message,
    loadDrivers,
    scan,
    scanUpdates,
    installUpdates,
    previewClean,
    createRestoreGate,
    executeClean,
  };
}
