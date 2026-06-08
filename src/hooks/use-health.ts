/**
 * `useHealth` — custom hook that encapsulates all Health Intelligence API calls.
 *
 * Components and pages MUST use this hook to interact with health data.
 * They must NOT import from `src/api/tauri/health.ts` directly (doc 48 AC-FS-04).
 */

import { useCallback } from 'react';
import {
  acknowledgeAlert as apiAcknowledgeAlert,
  collectHealthSample as apiCollectHealthSample,
  getHealthAlerts,
  getHealthSamples,
  getLatestHealthSample,
} from '../api/tauri/health';
import { useHealthStore, type HealthStore } from '../store/health.store';

export interface UseHealthReturn {
  latest: HealthStore['latest'];
  samples: HealthStore['samples'];
  alerts: HealthStore['alerts'];
  sampling: HealthStore['sampling'];
  loading: HealthStore['loading'];
  error: HealthStore['error'];
  /** Load (or reload) the latest sample, recent history, and alerts. */
  loadHealth: () => Promise<void>;
  /** Capture a new sample, then refresh the latest sample, history, and alerts. */
  collectSample: () => Promise<void>;
  /** Acknowledge an alert by id, then reload the alert list. */
  acknowledge: (alertId: string) => Promise<void>;
}

function toMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return fallback;
}

export function useHealth(): UseHealthReturn {
  const {
    latest,
    samples,
    alerts,
    sampling,
    loading,
    error,
    setLatest,
    setSamples,
    setAlerts,
    setSampling,
    setLoading,
    setError,
  } = useHealthStore();

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [latestSample, history, alertList] = await Promise.all([
        getLatestHealthSample(),
        getHealthSamples(),
        getHealthAlerts(),
      ]);
      setLatest(latestSample);
      setSamples(history);
      setAlerts(alertList);
    } catch (err) {
      setError(toMessage(err, 'Failed to load health data.'));
      setLatest(null);
      setSamples([]);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [setAlerts, setError, setLatest, setLoading, setSamples]);

  const collectSample = useCallback(async () => {
    setSampling(true);
    setError(null);
    try {
      const sample = await apiCollectHealthSample();
      setLatest(sample);
      const [history, alertList] = await Promise.all([
        getHealthSamples(),
        getHealthAlerts(),
      ]);
      setSamples(history);
      setAlerts(alertList);
    } catch (err) {
      setError(toMessage(err, 'Failed to collect a health sample.'));
    } finally {
      setSampling(false);
    }
  }, [setAlerts, setError, setLatest, setSampling, setSamples]);

  const acknowledge = useCallback(
    async (alertId: string) => {
      setError(null);
      try {
        await apiAcknowledgeAlert(alertId);
        const alertList = await getHealthAlerts();
        setAlerts(alertList);
      } catch (err) {
        setError(toMessage(err, 'Failed to acknowledge the alert.'));
      }
    },
    [setAlerts, setError],
  );

  return {
    latest,
    samples,
    alerts,
    sampling,
    loading,
    error,
    loadHealth,
    collectSample,
    acknowledge,
  };
}
