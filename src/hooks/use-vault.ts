/**
 * `useVault` - custom hook for Recovery Vault API calls.
 *
 * Components and pages MUST use this hook to interact with vault data.
 * They must NOT import from `src/api/tauri/vault.ts` directly.
 */

import { useCallback, useState } from 'react';
import {
  createDirectoryImage as apiCreateDirectoryImage,
  createDnaVaultBackup as apiCreateDnaVaultBackup,
  createRestorePoint as apiCreateRestorePoint,
  listVaultEntries,
} from '../api/tauri/vault';
import type { VaultEntry } from '../types/device.types';

function toMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return fallback;
}

export interface UseVaultReturn {
  entries: VaultEntry[];
  loading: boolean;
  acting: boolean;
  error: string | null;
  message: string | null;
  loadEntries: () => Promise<void>;
  createRestorePoint: (description?: string | null) => Promise<void>;
  createDnaBackup: () => Promise<void>;
  createDirectoryImage: (sourcePath: string) => Promise<void>;
}

export function useVault(): UseVaultReturn {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listVaultEntries();
      setEntries(list);
    } catch (err) {
      setError(toMessage(err, 'Failed to load vault entries.'));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const createRestorePoint = useCallback(async (description?: string | null) => {
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const entry = await apiCreateRestorePoint(description);
      setEntries((prev) => [entry, ...prev.filter((e) => e.id !== entry.id)]);
      setMessage(`Restore point created: ${entry.title}`);
    } catch (err) {
      setError(toMessage(err, 'Failed to create restore point.'));
    } finally {
      setActing(false);
    }
  }, []);

  const createDnaBackup = useCallback(async () => {
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const entry = await apiCreateDnaVaultBackup();
      setEntries((prev) => [entry, ...prev.filter((e) => e.id !== entry.id)]);
      setMessage(`DNA vault backup created: ${entry.title}`);
    } catch (err) {
      setError(toMessage(err, 'Failed to create DNA vault backup.'));
    } finally {
      setActing(false);
    }
  }, []);

  const createDirectoryImage = useCallback(async (sourcePath: string) => {
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const entry = await apiCreateDirectoryImage(sourcePath);
      setEntries((prev) => [entry, ...prev.filter((e) => e.id !== entry.id)]);
      setMessage(`Directory image created: ${entry.title}`);
    } catch (err) {
      setError(toMessage(err, 'Failed to create directory image.'));
    } finally {
      setActing(false);
    }
  }, []);

  return {
    entries,
    loading,
    acting,
    error,
    message,
    loadEntries,
    createRestorePoint,
    createDnaBackup,
    createDirectoryImage,
  };
}
