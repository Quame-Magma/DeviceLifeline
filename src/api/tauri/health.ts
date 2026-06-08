/**
 * Typed Tauri IPC wrappers for Health Intelligence commands.
 *
 * These are the ONLY entry points for Tauri `invoke` calls related to health.
 * Components and pages MUST NOT call `invoke` directly (doc 48 AC-FS-04).
 *
 * Command names are snake_case (Tauri convention).
 */

import { invoke } from '@tauri-apps/api/core';
import type { HealthAlert, HealthSample } from '../../types/device.types';

/** Capture a new health sample for the local device and persist it. */
export const collectHealthSample = (): Promise<HealthSample> =>
  invoke<HealthSample>('collect_health_sample');

/** Retrieve all health samples, newest first. */
export const getHealthSamples = (): Promise<HealthSample[]> =>
  invoke<HealthSample[]>('get_health_samples');

/** Retrieve the most recent health sample, or null if none exist. */
export const getLatestHealthSample = (): Promise<HealthSample | null> =>
  invoke<HealthSample | null>('get_latest_health_sample');

/** Retrieve all health alerts, unacknowledged first then newest. */
export const getHealthAlerts = (): Promise<HealthAlert[]> =>
  invoke<HealthAlert[]>('get_health_alerts');

/** Mark a health alert acknowledged. */
export const acknowledgeAlert = (alertId: string): Promise<void> =>
  invoke<void>('acknowledge_alert', { alertId });
