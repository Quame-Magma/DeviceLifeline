/**
 * `useProcess` - custom hook for Process Intelligence API calls.
 *
 * Components and pages MUST use this hook to interact with process data.
 * They must NOT import from `src/api/tauri/process.ts` directly.
 */

import { useCallback, useState } from 'react';
import {
  getProcessDeep,
  getProcessDetail,
  getProcessTree,
  killProcess as apiKillProcess,
  listProcesses,
  listServices,
} from '../api/tauri/process';
import type {
  ProcessDeepDetail,
  ProcessInfo,
  ProcessKillResult,
  ProcessSnapshot,
  ProcessTreeNode,
  ServiceInfo,
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

export interface UseProcessReturn {
  processes: ProcessInfo[];
  snapshot: ProcessSnapshot | null;
  tree: ProcessTreeNode[];
  services: ServiceInfo[];
  selected: ProcessInfo | null;
  deep: ProcessDeepDetail | null;
  loading: boolean;
  loadingDeep: boolean;
  killing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadTree: () => Promise<void>;
  loadServices: () => Promise<void>;
  selectProcess: (process: ProcessInfo | null) => void;
  loadDetail: (pid: number) => Promise<void>;
  loadDeep: (pid: number) => Promise<void>;
  clearDeep: () => void;
  kill: (pid: number, tree?: boolean) => Promise<ProcessKillResult | null>;
}

export function useProcess(): UseProcessReturn {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [snapshot, setSnapshot] = useState<ProcessSnapshot | null>(null);
  const [tree, setTree] = useState<ProcessTreeNode[]>([]);
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [selected, setSelected] = useState<ProcessInfo | null>(null);
  const [deep, setDeep] = useState<ProcessDeepDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDeep, setLoadingDeep] = useState(false);
  const [killing, setKilling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listProcesses();
      setSnapshot(data);
      setProcesses(data.processes ?? []);
    } catch (err) {
      setError(toMessage(err, 'Failed to list processes.'));
      setProcesses([]);
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nodes = await getProcessTree();
      setTree(nodes ?? []);
    } catch (err) {
      setError(toMessage(err, 'Failed to load process tree.'));
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadServices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listServices();
      setServices(rows ?? []);
    } catch (err) {
      setError(toMessage(err, 'Failed to load services.'));
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearDeep = useCallback(() => {
    setDeep(null);
  }, []);

  const selectProcess = useCallback((process: ProcessInfo | null) => {
    setSelected(process);
    setDeep(null);
  }, []);

  const loadDetail = useCallback(async (pid: number) => {
    setError(null);
    try {
      const detail = await getProcessDetail(pid);
      if (detail) {
        setSelected(detail);
      }
    } catch (err) {
      setError(toMessage(err, 'Failed to load process detail.'));
    }
  }, []);

  const loadDeep = useCallback(async (pid: number) => {
    setLoadingDeep(true);
    setError(null);
    try {
      const detail = await getProcessDeep(pid);
      setDeep(detail);
      if (detail.process) {
        setSelected(detail.process);
      }
    } catch (err) {
      setError(toMessage(err, 'Failed to load deep process detail.'));
      setDeep(null);
    } finally {
      setLoadingDeep(false);
    }
  }, []);

  const kill = useCallback(
    async (pid: number, treeKill?: boolean): Promise<ProcessKillResult | null> => {
      setKilling(true);
      setError(null);
      try {
        const result = await apiKillProcess(pid, true, treeKill ?? false);
        if (result.success) {
          setSelected((current) =>
            current && current.pid === pid ? null : current,
          );
          setDeep(null);
          await refresh();
          await loadTree();
        } else {
          setError(result.message || 'Process could not be ended.');
        }
        return result;
      } catch (err) {
        setError(toMessage(err, 'Failed to end process.'));
        return null;
      } finally {
        setKilling(false);
      }
    },
    [loadTree, refresh],
  );

  return {
    processes,
    snapshot,
    tree,
    services,
    selected,
    deep,
    loading,
    loadingDeep,
    killing,
    error,
    refresh,
    loadTree,
    loadServices,
    selectProcess,
    loadDetail,
    loadDeep,
    clearDeep,
    kill,
  };
}
