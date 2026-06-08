/**
 * `useHealth` — custom hook that encapsulates all Health Intelligence API calls.
 *
 * Components and pages MUST use this hook to interact with health data.
 * They must NOT import from `src/api/tauri/health.ts` directly (doc 48 AC-FS-04).
 */

import { useCallback } from 'react';
import {
  collectHealthSample as apiCollectHealthSample,
  getHealthSamples,
  getLatestHealthSample,
} from '../api/tauri/health';
import { useHealthStore, type HealthStore } from '../store/health.store';

export interface UseHealthReturn {
  latest: HealthStore['latest'];
  samples: HealthStore['samples'];
  sampling: HealthStore['sampling'];
  loading: HealthStore['loading'];
  error: HealthStore['error'];
  /** Load (or reload) the latest sample and the recent-sample history. */
  loadHealth: () => Promise<void>;
  /** Capture a new sample, then refresh the latest sample and history. */
  collectSample: () => Promise<void>;
}

export function useHealth(): UseHealthReturn {
  const {
    latest,
    samples,
    sampling,
    loading,
    error,
    setLatest,
    setSamples,
    setSampling,
    setLoading,
    setError,
  } = useHealthStore();

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [latestSample, history] = await Promise.all([
        getLatestHealthSample(),
        getHealthSamples(),
      ]);
      setLatest(latestSample);
      setSamples(history);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Failed to load health data.',
      );
      setLatest(null);
      setSamples([]);
    } finally {
      setLoading(false);
    }
  }, [setError, setLatest, setLoading, setSamples]);

  const collectSample = useCallback(async () => {
    setSampling(true);
    setError(null);
    try {
      const sample = await apiCollectHealthSample();
      setLatest(sample);
      const history = await getHealthSamples();
      setSamples(history);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Failed to collect a health sample.',
      );
    } finally {
      setSampling(false);
    }
  }, [setError, setLatest, setSampling, setSamples]);

  return {
    latest,
    samples,
    sampling,
    loading,
    error,
    loadHealth,
    collectSample,
  };
}
