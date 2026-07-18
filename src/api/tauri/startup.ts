/**
 * Typed Tauri IPC wrappers for Autoruns-class startup intelligence.
 */

import { invoke } from '@tauri-apps/api/core';
import type { StartupEntry, StartupToggleResult } from '../../types/device.types';

export const listStartupEntries = (): Promise<StartupEntry[]> =>
  invoke<StartupEntry[]>('list_startup_entries');

export const setStartupEnabled = (
  entryId: string,
  enabled: boolean,
  confirm: boolean,
): Promise<StartupToggleResult> =>
  invoke<StartupToggleResult>('set_startup_enabled', {
    entryId,
    enabled,
    confirm,
  });
