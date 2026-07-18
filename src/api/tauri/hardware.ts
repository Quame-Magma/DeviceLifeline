/**
 * Typed Tauri IPC wrappers for Hardware Intelligence commands.
 *
 * These are the ONLY entry points for Tauri `invoke` calls related to
 * hardware samples. Components and pages MUST NOT call `invoke` directly
 * (doc 48 AC-FS-04).
 *
 * Command names are snake_case (Tauri convention).
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  DiskHealthSummary,
  HardwareSample,
} from '../../types/device.types';

/** Sample hardware (temps/GPU/SMART) and persist the result. */
export const collectHardwareSample = (): Promise<HardwareSample> =>
  invoke<HardwareSample>('collect_hardware_sample');

/** Retrieve the most recent hardware sample, or null if none exist. */
export const getLatestHardwareSample = (): Promise<HardwareSample | null> =>
  invoke<HardwareSample | null>('get_latest_hardware_sample');

/** Retrieve recent hardware samples, newest first. */
export const getHardwareSamples = (
  limit?: number | null,
): Promise<HardwareSample[]> =>
  invoke<HardwareSample[]>('get_hardware_samples', {
    limit: limit ?? null,
  });

/** CrystalDisk-style per-disk health scores from SMART / reliability data. */
export const getDiskHealthSummaries = (): Promise<DiskHealthSummary[]> =>
  invoke<DiskHealthSummary[]>('get_disk_health_summaries');
