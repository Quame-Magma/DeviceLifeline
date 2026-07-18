/**
 * Typed IPC for Patch My PC–class software updates.
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  SoftwareUpdate,
  UpdateApplyResult,
} from '../../types/device.types';

export const scanSoftwareUpdates = (): Promise<SoftwareUpdate[]> =>
  invoke<SoftwareUpdate[]>('scan_software_updates');

export const listSoftwareUpdates = (): Promise<SoftwareUpdate[]> =>
  invoke<SoftwareUpdate[]>('list_software_updates');

export const applySoftwareUpdates = (
  updateIds: string[],
  confirm: boolean,
): Promise<UpdateApplyResult> =>
  invoke<UpdateApplyResult>('apply_software_updates', {
    updateIds,
    confirm,
  });
