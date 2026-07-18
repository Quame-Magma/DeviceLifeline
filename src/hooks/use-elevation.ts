/**
 * Elevation status for sidebar / deep-feature prompts.
 */

import { useCallback, useState } from 'react';
import {
  getElevationStatus,
  requestElevation,
  type ElevationStatus,
} from '../api/tauri/elevation';

function toMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return fallback;
}

export function useElevation() {
  const [status, setStatus] = useState<ElevationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getElevationStatus();
      setStatus(s);
    } catch (err) {
      setError(toMessage(err, 'Could not read elevation status.'));
      setStatus({ elevated: false, autoElevate: true, platform: 'unknown' });
    } finally {
      setLoading(false);
    }
  }, []);

  const elevate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await requestElevation();
      setStatus(s);
      return s;
    } catch (err) {
      setError(toMessage(err, 'Elevation request failed or was cancelled.'));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { status, error, loading, refresh, elevate };
}
