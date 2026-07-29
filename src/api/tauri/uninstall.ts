import { invoke } from '@tauri-apps/api/core';
import type {
  InstalledApp,
  UninstallResult,
  UninstallScan,
} from '../../types/device.types';

export const listInstalledApps = (): Promise<InstalledApp[]> =>
  invoke<InstalledApp[]>('list_installed_apps');

export const scanUninstallLeftovers = (appId: string): Promise<UninstallScan> =>
  invoke<UninstallScan>('scan_uninstall_leftovers', { appId });

export const uninstallApp = (
  appId: string,
  confirm: boolean,
): Promise<UninstallResult> =>
  invoke<UninstallResult>('uninstall_app', { appId, confirm });

export const removeUninstallLeftovers = (
  appId: string,
  paths: string[],
  confirm: boolean,
): Promise<UninstallResult> =>
  invoke<UninstallResult>('remove_uninstall_leftovers', {
    appId,
    paths,
    confirm,
  });
