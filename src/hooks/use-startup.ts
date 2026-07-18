/**
 * `useStartup` — Autoruns-class startup inventory and toggles.
 */

import { useCallback, useState } from 'react';
import {
  listStartupEntries,
  setStartupEnabled as apiSetEnabled,
} from '../api/tauri/startup';
import type { StartupEntry } from '../types/device.types';

function toMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

export function useStartup() {
  const [entries, setEntries] = useState<StartupEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listStartupEntries();
      setEntries(list ?? []);
    } catch (err) {
      setError(toMessage(err, 'Failed to list startup entries.'));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const setEnabled = useCallback(
    async (entryId: string, enabled: boolean) => {
      setActing(true);
      setError(null);
      setMessage(null);
      try {
        const result = await apiSetEnabled(entryId, enabled, true);
        setMessage(result.message);
        await load();
      } catch (err) {
        setError(toMessage(err, 'Failed to change startup entry.'));
      } finally {
        setActing(false);
      }
    },
    [load],
  );

  return {
    entries,
    loading,
    acting,
    error,
    message,
    load,
    setEnabled,
  };
}
