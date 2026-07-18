/**
 * Typed Tauri IPC wrappers for Storage Intelligence commands.
 *
 * These are the ONLY entry points for Tauri `invoke` calls related to storage
 * scans. Components and pages MUST NOT call `invoke` directly.
 *
 * Command names are snake_case (Tauri convention).
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  LogicalDrive,
  StorageFolderNode,
  StorageItem,
  StorageScan,
  StorageScanResult,
} from '../../types/device.types';

/** Start a storage scan (optionally rooted at `rootPath`). */
export const scanStorage = (
  rootPath?: string | null,
): Promise<StorageScanResult> =>
  invoke<StorageScanResult>('scan_storage', { rootPath: rootPath ?? null });

/** Fetch the most recent storage scan, or null if none exist. */
export const getLatestStorageScan = (): Promise<StorageScan | null> =>
  invoke<StorageScan | null>('get_latest_storage_scan');

/** List items discovered in a scan, largest first. */
export const getStorageItems = (scanId: string): Promise<StorageItem[]> =>
  invoke<StorageItem[]>('get_storage_items', { scanId });

/**
 * Hierarchical folder size map (WizTree-style).
 * Optional `rootPath` and `maxDepth` limit the walk.
 */
export const getStorageFolderMap = (
  rootPath?: string | null,
  maxDepth?: number | null,
): Promise<StorageFolderNode> =>
  invoke<StorageFolderNode>('get_storage_folder_map', {
    rootPath: rootPath ?? null,
    maxDepth: maxDepth ?? null,
  });

/**
 * Volume-wide size map (drive root). Prefer for multi-GB volumes.
 * Optional `volume` defaults to C: on the backend when empty/null.
 */
export const getVolumeMap = (
  volume?: string | null,
): Promise<StorageFolderNode> =>
  invoke<StorageFolderNode>('get_volume_map', { volume: volume ?? null });

/** List mounted logical drives for disk pickers. */
export const listLogicalDrives = (): Promise<LogicalDrive[]> =>
  invoke<LogicalDrive[]>('list_logical_drives');
