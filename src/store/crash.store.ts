/**
 * Zustand store for Crash Intelligence state.
 *
 * Holds the recorded crash events and request flags. It must NOT contain API
 * calls — those live in `hooks/use-crash.ts`.
 */

import { create } from 'zustand';
import type { CrashEvent } from '../types/device.types';

export interface CrashStore {
  /** All recorded crash events, newest first. */
  events: CrashEvent[];
  /** True while a scan is running. */
  scanning: boolean;
  /** True while loading the event history. */
  loading: boolean;
  /** Error message from the most recent failed operation, or null. */
  error: string | null;

  // Actions
  setEvents: (events: CrashEvent[]) => void;
  setScanning: (scanning: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useCrashStore = create<CrashStore>((set) => ({
  events: [],
  scanning: false,
  loading: false,
  error: null,

  setEvents: (events) => set({ events }),
  setScanning: (scanning) => set({ scanning }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
