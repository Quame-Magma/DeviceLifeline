/**
 * Typed IPC for Macrium-class volume shadows and schedules.
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  BackupSchedule,
  ShadowRestoreResult,
  VolumeShadow,
} from '../../types/device.types';

export const createVolumeShadow = (
  volume?: string | null,
): Promise<VolumeShadow> =>
  invoke<VolumeShadow>('create_volume_shadow', { volume: volume ?? null });

export const listVolumeShadows = (): Promise<VolumeShadow[]> =>
  invoke<VolumeShadow[]>('list_volume_shadows');

export const createBackupSchedule = (
  volume: string | null | undefined,
  frequency: string,
): Promise<BackupSchedule> =>
  invoke<BackupSchedule>('create_backup_schedule', {
    volume: volume ?? null,
    frequency,
  });

export const listBackupSchedules = (): Promise<BackupSchedule[]> =>
  invoke<BackupSchedule[]>('list_backup_schedules');

export const setBackupScheduleEnabled = (
  scheduleId: string,
  enabled: boolean,
): Promise<void> =>
  invoke<void>('set_backup_schedule_enabled', { scheduleId, enabled });

export const runBackupScheduleNow = (
  scheduleId: string,
): Promise<VolumeShadow> =>
  invoke<VolumeShadow>('run_backup_schedule_now', { scheduleId });

export const restoreFromShadow = (
  shadowRowId: string,
  relativePath: string,
  destPath: string,
  confirm: boolean,
): Promise<ShadowRestoreResult> =>
  invoke<ShadowRestoreResult>('restore_from_shadow', {
    shadowRowId,
    relativePath,
    destPath,
    confirm,
  });
