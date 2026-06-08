/**
 * Typed Tauri IPC wrappers for device-related commands.
 *
 * These are the ONLY entry points for Tauri `invoke` calls related to devices.
 * Components and pages MUST NOT call `invoke` directly (doc 48 AC-FS-04).
 *
 * Command names are snake_case (Tauri convention).
 * Argument keys are camelCase; Tauri v2 maps them to snake_case Rust params.
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  Device,
  DeviceDnaSnapshot,
  SoftwareInventoryItem,
} from '../../types/device.types';

/** Trigger a new software inventory capture and persist it as a snapshot. */
export const collectDnaSnapshot = (): Promise<DeviceDnaSnapshot> =>
  invoke<DeviceDnaSnapshot>('collect_dna_snapshot');

/** Retrieve all registered devices. */
export const getDevices = (): Promise<Device[]> =>
  invoke<Device[]>('get_devices');

/** Retrieve all snapshots, ordered newest first. */
export const getSnapshots = (): Promise<DeviceDnaSnapshot[]> =>
  invoke<DeviceDnaSnapshot[]>('get_snapshots');

/** Retrieve a single snapshot by ID, or null if not found. */
export const getSnapshot = (
  snapshotId: string,
): Promise<DeviceDnaSnapshot | null> =>
  invoke<DeviceDnaSnapshot | null>('get_snapshot', { snapshotId });

/**
 * Retrieve software inventory items for a snapshot, ordered by name.
 */
export const getSoftwareInventory = (
  snapshotId: string,
): Promise<SoftwareInventoryItem[]> =>
  invoke<SoftwareInventoryItem[]>('get_software_inventory', { snapshotId });
