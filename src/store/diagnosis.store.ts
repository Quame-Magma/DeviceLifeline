/**
 * Zustand store for AI Detective state.
 *
 * Holds the session history, the currently-viewed session and its findings,
 * and request flags. No API calls live here — those are in `hooks/use-diagnosis.ts`.
 */

import { create } from 'zustand';
import type {
  DiagnosisFinding,
  DiagnosisSession,
} from '../types/device.types';

export interface DiagnosisStore {
  /** All diagnosis sessions, newest first. */
  sessions: DiagnosisSession[];
  /** The currently-viewed session, or null. */
  current: DiagnosisSession | null;
  /** Findings for the current session. */
  findings: DiagnosisFinding[];
  /** True while a diagnosis is running. */
  running: boolean;
  /** True while loading the session history. */
  loading: boolean;
  /** Error message from the most recent failed operation, or null. */
  error: string | null;

  // Actions
  setSessions: (sessions: DiagnosisSession[]) => void;
  setCurrent: (session: DiagnosisSession | null) => void;
  setFindings: (findings: DiagnosisFinding[]) => void;
  setRunning: (running: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useDiagnosisStore = create<DiagnosisStore>((set) => ({
  sessions: [],
  current: null,
  findings: [],
  running: false,
  loading: false,
  error: null,

  setSessions: (sessions) => set({ sessions }),
  setCurrent: (current) => set({ current }),
  setFindings: (findings) => set({ findings }),
  setRunning: (running) => set({ running }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
