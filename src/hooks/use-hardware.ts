/**
 * `useHardware` - custom hook for Hardware Intelligence API calls.
 *
 * Components and pages MUST use this hook to interact with hardware data.
 * They must NOT import from `src/api/tauri/hardware.ts` directly.
 */

import { useCallback, useState } from 'react';
import {
  collectHardwareSample as apiCollectHardwareSample,
  getDiskHealthSummaries,
  getHardwareSamples,
  getLatestHardwareSample,
} from '../api/tauri/hardware';
import type { DiskHealthSummary, HardwareSample } from '../types/device.types';

function toMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return fallback;
}

export interface UseHardwareReturn {
  latest: HardwareSample | null;
  samples: HardwareSample[];
  diskHealth: DiskHealthSummary[];
  loading: boolean;
  sampling: boolean;
  error: string | null;
  loadHardware: () => Promise<void>;
  /** @param depth `"quick"` keeps the UI responsive (Overview); `"full"` for Performance. */
  collectSample: (depth?: 'quick' | 'full') => Promise<void>;
  loadDiskHealth: () => Promise<void>;
}

export function useHardware(): UseHardwareReturn {
  const [latest, setLatest] = useState<HardwareSample | null>(null);
  const [samples, setSamples] = useState<HardwareSample[]>([]);
  const [diskHealth, setDiskHealth] = useState<DiskHealthSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [sampling, setSampling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDiskHealth = useCallback(async () => {
    try {
      const summaries = await getDiskHealthSummaries();
      setDiskHealth(summaries ?? []);
    } catch (err) {
      setError(toMessage(err, 'Failed to load disk health.'));
      setDiskHealth([]);
    }
  }, []);

  const loadHardware = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [latestSample, history] = await Promise.all([
        getLatestHardwareSample(),
        getHardwareSamples(20),
      ]);
      setLatest(latestSample);
      setSamples(history);
      try {
        const summaries = await getDiskHealthSummaries();
        setDiskHealth(summaries ?? []);
      } catch {
        // Disk health is optional when no samples exist yet.
        setDiskHealth([]);
      }
    } catch (err) {
      setError(toMessage(err, 'Failed to load hardware data.'));
      setLatest(null);
      setSamples([]);
      setDiskHealth([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const collectSample = useCallback(async (depth: 'quick' | 'full' = 'full') => {
    setSampling(true);
    setError(null);
    try {
      const sample = await apiCollectHardwareSample(depth);
      setLatest(sample);
      const history = await getHardwareSamples(20);
      setSamples(history);
      // Disk health summaries now read the latest cached sample (no second full harvest).
      try {
        const summaries = await getDiskHealthSummaries();
        setDiskHealth(summaries ?? []);
      } catch {
        // Keep prior disk health if summary fetch fails after sample.
      }
    } catch (err) {
      setError(toMessage(err, 'Failed to collect a hardware sample.'));
    } finally {
      setSampling(false);
    }
  }, []);

  return {
    latest,
    samples,
    diskHealth,
    loading,
    sampling,
    error,
    loadHardware,
    collectSample,
    loadDiskHealth,
  };
}
