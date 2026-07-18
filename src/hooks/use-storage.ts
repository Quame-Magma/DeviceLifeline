/**
 * `useStorage` - custom hook for Storage Intelligence API calls.
 *
 * Components and pages MUST use this hook to interact with storage data.
 * They must NOT import from `src/api/tauri/storage.ts` directly.
 */

import { useCallback, useState } from 'react';
import {
  getLatestStorageScan,
  getStorageFolderMap,
  getStorageItems,
  getVolumeMap,
  listLogicalDrives,
  scanStorage,
} from '../api/tauri/storage';
import type {
  LogicalDrive,
  StorageFolderNode,
  StorageItem,
  StorageScan,
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

export interface UseStorageReturn {
  scan: StorageScan | null;
  items: StorageItem[];
  folderMap: StorageFolderNode | null;
  drives: LogicalDrive[];
  loading: boolean;
  scanning: boolean;
  mapping: boolean;
  error: string | null;
  loadLatest: () => Promise<void>;
  loadDrives: () => Promise<void>;
  runScan: (rootPath?: string | null) => Promise<void>;
  loadFolderMap: (
    rootPath?: string | null,
    maxDepth?: number | null,
  ) => Promise<void>;
  loadVolumeMap: (volume?: string | null) => Promise<void>;
}

export function useStorage(): UseStorageReturn {
  const [scan, setScan] = useState<StorageScan | null>(null);
  const [items, setItems] = useState<StorageItem[]>([]);
  const [folderMap, setFolderMap] = useState<StorageFolderNode | null>(null);
  const [drives, setDrives] = useState<LogicalDrive[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadItemsForScan = useCallback(async (scanId: string) => {
    try {
      const list = await getStorageItems(scanId);
      setItems(list);
    } catch (err) {
      setError(toMessage(err, 'Failed to load storage items.'));
      setItems([]);
    }
  }, []);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const latest = await getLatestStorageScan();
      setScan(latest);
      if (latest) {
        await loadItemsForScan(latest.id);
      } else {
        setItems([]);
      }
    } catch (err) {
      setError(toMessage(err, 'Failed to load storage scan.'));
      setScan(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [loadItemsForScan]);

  const loadDrives = useCallback(async () => {
    try {
      const list = await listLogicalDrives();
      setDrives(list ?? []);
    } catch {
      // Drive picker falls back to C:\ in DriveSelect; don't block the page.
      setDrives([]);
    }
  }, []);

  const runScan = useCallback(async (rootPath?: string | null) => {
    setScanning(true);
    setError(null);
    try {
      const result = await scanStorage(rootPath);
      setScan(result.scan);
      setItems(result.items ?? []);
    } catch (err) {
      setError(toMessage(err, 'Failed to scan storage.'));
    } finally {
      setScanning(false);
    }
  }, []);

  const loadFolderMap = useCallback(
    async (rootPath?: string | null, maxDepth?: number | null) => {
      setMapping(true);
      setError(null);
      try {
        const map = await getStorageFolderMap(rootPath, maxDepth);
        setFolderMap(map);
      } catch (err) {
        setError(toMessage(err, 'Failed to build folder map.'));
        setFolderMap(null);
      } finally {
        setMapping(false);
      }
    },
    [],
  );

  const loadVolumeMap = useCallback(async (volume?: string | null) => {
    setMapping(true);
    setError(null);
    try {
      const map = await getVolumeMap(volume);
      setFolderMap(map);
    } catch (err) {
      setError(toMessage(err, 'Failed to build volume map.'));
      setFolderMap(null);
    } finally {
      setMapping(false);
    }
  }, []);

  return {
    scan,
    items,
    folderMap,
    drives,
    loading,
    scanning,
    mapping,
    error,
    loadLatest,
    loadDrives,
    runScan,
    loadFolderMap,
    loadVolumeMap,
  };
}
