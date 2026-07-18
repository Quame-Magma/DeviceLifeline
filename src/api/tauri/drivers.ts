/**
 * Typed Tauri IPC wrappers for Driver Intelligence commands.
 *
 * These are the ONLY entry points for Tauri `invoke` calls related to
 * drivers. Components and pages MUST NOT call `invoke` directly
 * (doc 48 AC-FS-04).
 *
 * Command names are snake_case (Tauri convention).
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  DriverInfo,
  GpuCleanPlan,
  GpuCleanResult,
  VaultEntry,
} from '../../types/device.types';

/** Scan installed drivers, score health, and persist results. */
export const scanDrivers = (): Promise<DriverInfo[]> =>
  invoke<DriverInfo[]>('scan_drivers');

/** List previously scanned drivers for the local device. */
export const listDrivers = (): Promise<DriverInfo[]> =>
  invoke<DriverInfo[]>('list_drivers');

/** Dry-run DDU-class GPU driver clean plan. */
export const previewGpuDriverClean = (
  vendor?: string | null,
): Promise<GpuCleanPlan> =>
  invoke<GpuCleanPlan>('preview_gpu_driver_clean', {
    vendor: vendor ?? null,
  });

/** System Restore point for the GPU clean gate. */
export const createGpuCleanRestorePoint = (): Promise<VaultEntry> =>
  invoke<VaultEntry>('create_gpu_clean_restore_point');

/** Execute allowlisted package removal after restore point + confirm. */
export const executeGpuDriverClean = (opts: {
  planId: string;
  restorePointId: string;
  vendor?: string | null;
  confirm: boolean;
}): Promise<GpuCleanResult> =>
  invoke<GpuCleanResult>('execute_gpu_driver_clean', {
    planId: opts.planId,
    restorePointId: opts.restorePointId,
    vendor: opts.vendor ?? null,
    confirm: opts.confirm,
  });
