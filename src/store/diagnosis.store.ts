/**
 * Zustand store for AI Detective / Copilot state.
 *
 * Holds session history, multi-turn chat transcript, and request flags.
 * No API calls live here — those are in `hooks/use-diagnosis.ts`.
 */

import { create } from 'zustand';
import type {
  DiagnosisFinding,
  DiagnosisSession,
} from '../types/device.types';

/** One bubble in the live conversation (not the same as persisted sessions). */
export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  /** Set on assistant turns that came from a diagnosis run. */
  sessionId?: string;
  findings?: DiagnosisFinding[];
}

export interface DiagnosisStore {
  /** All diagnosis sessions, newest first (sidebar history). */
  sessions: DiagnosisSession[];
  /** The most recent session from the active thread. */
  current: DiagnosisSession | null;
  /** Findings for the latest assistant turn (compat). */
  findings: DiagnosisFinding[];
  /** Accumulated multi-turn chat for the active conversation. */
  turns: ChatTurn[];
  /** True while a diagnosis is running. */
  running: boolean;
  /** True while loading the session history. */
  loading: boolean;
  /** Error message from the most recent failed operation, or null. */
  error: string | null;

  setSessions: (sessions: DiagnosisSession[]) => void;
  setCurrent: (session: DiagnosisSession | null) => void;
  setFindings: (findings: DiagnosisFinding[]) => void;
  setTurns: (turns: ChatTurn[]) => void;
  appendTurns: (turns: ChatTurn[]) => void;
  clearThread: () => void;
  setRunning: (running: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useDiagnosisStore = create<DiagnosisStore>((set) => ({
  sessions: [],
  current: null,
  findings: [],
  turns: [],
  running: false,
  loading: false,
  error: null,

  setSessions: (sessions) => set({ sessions }),
  setCurrent: (current) => set({ current }),
  setFindings: (findings) => set({ findings }),
  setTurns: (turns) => set({ turns }),
  appendTurns: (next) => set((s) => ({ turns: [...s.turns, ...next] })),
  clearThread: () =>
    set({
      turns: [],
      current: null,
      findings: [],
      error: null,
    }),
  setRunning: (running) => set({ running }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
