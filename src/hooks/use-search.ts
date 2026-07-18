/**
 * `useSearch` - custom hook for Universal Search API calls.
 *
 * Components and pages MUST use this hook to interact with search.
 * They must NOT import from `src/api/tauri/search.ts` directly.
 */

import { useCallback, useState } from 'react';
import {
  getFileIndexStatus,
  rebuildAllSearch,
  rebuildFileIndex as apiRebuildFileIndex,
  rebuildSearchIndex,
  rebuildUsnIndex as apiRebuildUsnIndex,
  searchAll,
} from '../api/tauri/search';
import type { FileIndexStatus, SearchResult } from '../types/device.types';

function toMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return fallback;
}

export interface UseSearchReturn {
  results: SearchResult[];
  query: string;
  fileIndexStatus: FileIndexStatus | null;
  loading: boolean;
  rebuilding: boolean;
  error: string | null;
  search: (query: string) => Promise<void>;
  rebuild: () => Promise<void>;
  rebuildFileIndex: () => Promise<void>;
  rebuildAll: () => Promise<void>;
  rebuildUsn: (volume?: string | null) => Promise<void>;
  loadFileIndexStatus: () => Promise<void>;
  clear: () => void;
}

export function useSearch(): UseSearchReturn {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [query, setQuery] = useState('');
  const [fileIndexStatus, setFileIndexStatus] =
    useState<FileIndexStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFileIndexStatus = useCallback(async () => {
    try {
      const status = await getFileIndexStatus();
      setFileIndexStatus(status);
    } catch (err) {
      setError(toMessage(err, 'Failed to load file index status.'));
      setFileIndexStatus(null);
    }
  }, []);

  const search = useCallback(async (nextQuery: string) => {
    const trimmed = nextQuery.trim();
    setQuery(nextQuery);
    if (trimmed.length === 0) {
      setResults([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const hits = await searchAll(trimmed);
      setResults(hits);
    } catch (err) {
      setError(toMessage(err, 'Failed to search.'));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const rebuild = useCallback(async () => {
    setRebuilding(true);
    setError(null);
    try {
      await rebuildSearchIndex();
    } catch (err) {
      setError(toMessage(err, 'Failed to rebuild search index.'));
    } finally {
      setRebuilding(false);
    }
  }, []);

  const rebuildFileIndex = useCallback(async () => {
    setRebuilding(true);
    setError(null);
    try {
      const status = await apiRebuildFileIndex();
      setFileIndexStatus(status);
    } catch (err) {
      setError(toMessage(err, 'Failed to rebuild file index.'));
    } finally {
      setRebuilding(false);
    }
  }, []);

  const rebuildAll = useCallback(async () => {
    setRebuilding(true);
    setError(null);
    try {
      const status = await rebuildAllSearch();
      setFileIndexStatus(status);
    } catch (err) {
      setError(toMessage(err, 'Failed to rebuild all search indexes.'));
    } finally {
      setRebuilding(false);
    }
  }, []);

  const rebuildUsn = useCallback(async (volume?: string | null) => {
    setRebuilding(true);
    setError(null);
    try {
      const status = await apiRebuildUsnIndex(volume);
      setFileIndexStatus(status);
    } catch (err) {
      setError(toMessage(err, 'Failed to rebuild USN index.'));
    } finally {
      setRebuilding(false);
    }
  }, []);

  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
    setError(null);
  }, []);

  return {
    results,
    query,
    fileIndexStatus,
    loading,
    rebuilding,
    error,
    search,
    rebuild,
    rebuildFileIndex,
    rebuildAll,
    rebuildUsn,
    loadFileIndexStatus,
    clear,
  };
}
