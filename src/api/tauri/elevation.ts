/**
 * Elevation status IPC (Windows UAC / admin).
 */

import { invoke } from '@tauri-apps/api/core';

export interface ElevationStatus {
  elevated: boolean;
  autoElevate: boolean;
  platform: string;
}

export const getElevationStatus = (): Promise<ElevationStatus> =>
  invoke<ElevationStatus>('get_elevation_status');

/** Request UAC relaunch. Current process may exit when relaunch succeeds. */
export const requestElevation = (): Promise<ElevationStatus> =>
  invoke<ElevationStatus>('request_elevation');
