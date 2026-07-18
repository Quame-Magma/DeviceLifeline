import { useCallback, useState } from 'react';
import {
  getSystemInventoryReport,
  runSystemBenchmark,
} from '../api/tauri/sysreport';
import type {
  BenchmarkResult,
  SystemInventoryReport,
} from '../types/device.types';

function toMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

export function useSysReport() {
  const [report, setReport] = useState<SystemInventoryReport | null>(null);
  const [benches, setBenches] = useState<BenchmarkResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [benching, setBenching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getSystemInventoryReport());
    } catch (err) {
      setError(toMessage(err, 'Failed to build system report.'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const runBench = useCallback(async (kind?: string) => {
    setBenching(true);
    setError(null);
    try {
      setBenches(await runSystemBenchmark(kind ?? 'all'));
    } catch (err) {
      setError(toMessage(err, 'Benchmark failed.'));
    } finally {
      setBenching(false);
    }
  }, []);

  return {
    report,
    benches,
    loading,
    benching,
    error,
    loadReport,
    runBench,
  };
}
