import { useCallback, useState } from 'react';
import {
  listInstalledApps,
  removeUninstallLeftovers,
  scanUninstallLeftovers,
  uninstallApp as apiUninstall,
} from '../api/tauri/uninstall';
import type {
  InstalledApp,
  UninstallResult,
  UninstallScan,
} from '../types/device.types';

function toMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

export function useUninstall() {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [scan, setScan] = useState<UninstallScan | null>(null);
  const [result, setResult] = useState<UninstallResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setApps((await listInstalledApps()) ?? []);
    } catch (err) {
      setError(toMessage(err, 'Failed to list apps.'));
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const scanLeftovers = useCallback(async (appId: string) => {
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const s = await scanUninstallLeftovers(appId);
      setScan(s);
      setMessage(
        `Found ${s.leftovers.length} leftover path(s) (~${Math.round(s.totalLeftoverBytes / (1024 * 1024))} MB).`,
      );
    } catch (err) {
      setError(toMessage(err, 'Leftover scan failed.'));
      setScan(null);
    } finally {
      setActing(false);
    }
  }, []);

  const uninstall = useCallback(
    async (appId: string) => {
      setActing(true);
      setError(null);
      setMessage(null);
      try {
        const r = await apiUninstall(appId, true);
        setResult(r);
        setMessage(r.message);
        setScan({
          app: scan?.app ?? (apps.find((a) => a.id === appId) as InstalledApp),
          leftovers: r.leftovers,
          totalLeftoverBytes: r.leftovers.reduce((s, l) => s + l.sizeBytes, 0),
        });
        await load();
      } catch (err) {
        setError(toMessage(err, 'Uninstall failed.'));
      } finally {
        setActing(false);
      }
    },
    [apps, load, scan],
  );

  const removeLeftovers = useCallback(
    async (appId: string, paths: string[]) => {
      setActing(true);
      setError(null);
      try {
        const r = await removeUninstallLeftovers(appId, paths, true);
        setResult(r);
        setMessage(r.message);
        setScan(null);
      } catch (err) {
        setError(toMessage(err, 'Leftover removal failed.'));
      } finally {
        setActing(false);
      }
    },
    [],
  );

  return {
    apps,
    scan,
    result,
    loading,
    acting,
    error,
    message,
    load,
    scanLeftovers,
    uninstall,
    removeLeftovers,
  };
}
