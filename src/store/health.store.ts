/**
 * Zustand store for Health Intelligence state.
 *
 * Holds the latest health sample, the recent-sample history, and request flags.
 * It must NOT contain API calls — those live in `hooks/use-health.ts`.
 */

import { create } from 'zustand';
import type { HealthSample } from '../types/device.types';

export interface HealthStore {
  /** The most recent health sample, or null if none captured yet. */
  latest: HealthSample | null;
  /** Recent health samples, newest first. */
  samples: HealthSample[];
  /** True while a new sample is being captured. */
  sampling: boolean;
  /** True while loading the latest sample and history. */
  loading: boolean;
  /** Error message from the most recent failed operation, or null. */
  error: string | null;

  // Actions
  setLatest: (sample: HealthSample | null) => void;
  setSamples: (samples: HealthSample[]) => void;
  setSampling: (sampling: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useHealthStore = create<HealthStore>((set) => ({
  latest: null,
  samples: [],
  sampling: false,
  loading: false,
  error: null,

  setLatest: (latest) => set({ latest }),
  setSamples: (samples) => set({ samples }),
  setSampling: (sampling) => set({ sampling }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
