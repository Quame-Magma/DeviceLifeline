import { invoke } from '@tauri-apps/api/core';
import type {
  BenchmarkResult,
  SystemInventoryReport,
} from '../../types/device.types';

export const getSystemInventoryReport =
  (): Promise<SystemInventoryReport> =>
    invoke<SystemInventoryReport>('get_system_inventory_report');

export const runSystemBenchmark = (
  kind?: string | null,
): Promise<BenchmarkResult[]> =>
  invoke<BenchmarkResult[]>('run_system_benchmark', { kind: kind ?? null });
