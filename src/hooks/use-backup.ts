import { useCallback, useState } from 'react';
import {
  createBackupSchedule as apiCreateSchedule,
  createVolumeShadow as apiCreateShadow,
  listBackupSchedules as apiListSchedules,
  listVolumeShadows as apiListShadows,
  restoreFromShadow as apiRestore,
  runBackupScheduleNow as apiRunNow,
  setBackupScheduleEnabled as apiSetEnabled,
} from '../api/tauri/backup';
import type {
  BackupSchedule,
  ShadowRestoreResult,
  VolumeShadow,
} from '../types/device.types';

function toMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

export function useBackup() {
  const [shadows, setShadows] = useState<VolumeShadow[]>([]);
  const [schedules, setSchedules] = useState<BackupSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastRestore, setLastRestore] = useState<ShadowRestoreResult | null>(
    null,
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, sch] = await Promise.all([
        apiListShadows(),
        apiListSchedules(),
      ]);
      setShadows(s);
      setSchedules(sch);
    } catch (err) {
      setError(toMessage(err, 'Failed to load backup state.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const createShadow = useCallback(
    async (volume?: string) => {
      setActing(true);
      setError(null);
      setMessage(null);
      try {
        const shadow = await apiCreateShadow(volume);
        setMessage(`Shadow created: ${shadow.shadowId}`);
        await refresh();
        return shadow;
      } catch (err) {
        setError(toMessage(err, 'Failed to create volume shadow.'));
        return null;
      } finally {
        setActing(false);
      }
    },
    [refresh],
  );

  const createSchedule = useCallback(
    async (volume: string, frequency: string) => {
      setActing(true);
      setError(null);
      try {
        await apiCreateSchedule(volume, frequency);
        setMessage(`Schedule created (${frequency}) for ${volume}`);
        await refresh();
      } catch (err) {
        setError(toMessage(err, 'Failed to create schedule.'));
      } finally {
        setActing(false);
      }
    },
    [refresh],
  );

  const setEnabled = useCallback(
    async (scheduleId: string, enabled: boolean) => {
      setActing(true);
      try {
        await apiSetEnabled(scheduleId, enabled);
        await refresh();
      } catch (err) {
        setError(toMessage(err, 'Failed to update schedule.'));
      } finally {
        setActing(false);
      }
    },
    [refresh],
  );

  const runNow = useCallback(
    async (scheduleId: string) => {
      setActing(true);
      setError(null);
      try {
        const shadow = await apiRunNow(scheduleId);
        setMessage(`Schedule ran · shadow ${shadow.shadowId}`);
        await refresh();
      } catch (err) {
        setError(toMessage(err, 'Failed to run schedule.'));
      } finally {
        setActing(false);
      }
    },
    [refresh],
  );

  const restore = useCallback(
    async (
      shadowRowId: string,
      relativePath: string,
      destPath: string,
      confirm: boolean,
    ) => {
      setActing(true);
      setError(null);
      try {
        const result = await apiRestore(
          shadowRowId,
          relativePath,
          destPath,
          confirm,
        );
        setLastRestore(result);
        setMessage(result.message);
        return result;
      } catch (err) {
        setError(toMessage(err, 'Failed to restore from shadow.'));
        return null;
      } finally {
        setActing(false);
      }
    },
    [],
  );

  return {
    shadows,
    schedules,
    loading,
    acting,
    error,
    message,
    lastRestore,
    refresh,
    createShadow,
    createSchedule,
    setEnabled,
    runNow,
    restore,
  };
}
