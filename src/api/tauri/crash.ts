/**
 * Typed Tauri IPC wrappers for Crash Intelligence commands.
 *
 * These are the ONLY entry points for Tauri `invoke` calls related to crashes.
 * Components and pages MUST NOT call `invoke` directly (doc 48 AC-FS-04).
 *
 * Command names are snake_case (Tauri convention).
 */

import { invoke } from '@tauri-apps/api/core';
import type { CrashEvent } from '../../types/device.types';

/** Scan the OS event log for crash/stability events and persist any new ones. */
export const scanCrashEvents = (): Promise<CrashEvent[]> =>
  invoke<CrashEvent[]>('scan_crash_events');

/** Retrieve all recorded crash events, newest first. */
export const getCrashEvents = (): Promise<CrashEvent[]> =>
  invoke<CrashEvent[]>('get_crash_events');
