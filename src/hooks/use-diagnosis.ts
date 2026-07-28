/**
 * `useDiagnosis` — custom hook for AI Detective / Copilot IPC calls.
 *
 * Components and pages MUST use this hook to run/load diagnoses.
 * They must NOT import from `src/api/tauri/diagnosis.ts` directly (doc 48 AC-FS-04).
 */

import { useCallback } from 'react';
import {
  getDiagnosisFindings,
  getDiagnosisSessions,
  runDiagnosis as apiRunDiagnosis,
} from '../api/tauri/diagnosis';
import {
  useDiagnosisStore,
  type ChatTurn,
  type DiagnosisStore,
} from '../store/diagnosis.store';
import type { DiagnosisSession } from '../types/device.types';

export interface UseDiagnosisReturn {
  sessions: DiagnosisStore['sessions'];
  current: DiagnosisStore['current'];
  findings: DiagnosisStore['findings'];
  turns: DiagnosisStore['turns'];
  running: DiagnosisStore['running'];
  loading: DiagnosisStore['loading'];
  error: DiagnosisStore['error'];
  /** Load (or reload) the session history. */
  loadSessions: () => Promise<void>;
  /**
   * Ask Copilot — appends to the live multi-turn thread instead of replacing it.
   */
  ask: (query: string) => Promise<void>;
  /** Show a past session as a fresh 1-turn thread. */
  selectSession: (session: DiagnosisSession) => Promise<void>;
  /** Start a new conversation (keeps sidebar history). */
  newChat: () => void;
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

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useDiagnosis(): UseDiagnosisReturn {
  const {
    sessions,
    current,
    findings,
    turns,
    running,
    loading,
    error,
    setSessions,
    setCurrent,
    setFindings,
    appendTurns,
    clearThread,
    setRunning,
    setLoading,
    setError,
    setTurns,
  } = useDiagnosisStore();

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSessions(await getDiagnosisSessions());
    } catch (err) {
      setError(toMessage(err, 'Failed to load diagnosis history.'));
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [setError, setLoading, setSessions]);

  const ask = useCallback(
    async (query: string) => {
      const text = query.trim();
      if (!text) return;

      const now = new Date().toISOString();
      const userTurn: ChatTurn = {
        id: newId(),
        role: 'user',
        content: text,
        createdAt: now,
      };
      appendTurns([userTurn]);
      setRunning(true);
      setError(null);

      try {
        // Prior turns (excluding the user message we just appended) for multi-turn context.
        const prior = useDiagnosisStore
          .getState()
          .turns.slice(0, -1)
          .slice(-8)
          .map((t) => `${t.role === 'user' ? 'User' : 'Copilot'}: ${t.content}`)
          .join('\n');
        const session = await apiRunDiagnosis(text, prior || null);
        const sessionFindings = await getDiagnosisFindings(session.id);
        const assistantTurn: ChatTurn = {
          id: newId(),
          role: 'assistant',
          content: session.summary,
          createdAt: session.createdAt || new Date().toISOString(),
          sessionId: session.id,
          findings: sessionFindings,
        };
        appendTurns([assistantTurn]);
        setCurrent(session);
        setFindings(sessionFindings);
        setSessions(await getDiagnosisSessions());
      } catch (err) {
        const message = toMessage(err, 'Diagnosis failed.');
        setError(message);
        appendTurns([
          {
            id: newId(),
            role: 'assistant',
            content: `Sorry — I hit a snag analyzing that: ${message}`,
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setRunning(false);
      }
    },
    [
      appendTurns,
      setCurrent,
      setError,
      setFindings,
      setRunning,
      setSessions,
    ],
  );

  const selectSession = useCallback(
    async (session: DiagnosisSession) => {
      setError(null);
      try {
        const sessionFindings = await getDiagnosisFindings(session.id);
        setCurrent(session);
        setFindings(sessionFindings);
        // Open history item as a single-turn thread (does not wipe other history).
        setTurns([
          {
            id: newId(),
            role: 'user',
            content: session.query,
            createdAt: session.createdAt,
          },
          {
            id: newId(),
            role: 'assistant',
            content: session.summary,
            createdAt: session.createdAt,
            sessionId: session.id,
            findings: sessionFindings,
          },
        ]);
      } catch (err) {
        setError(toMessage(err, 'Failed to load findings.'));
        setFindings([]);
      }
    },
    [setCurrent, setError, setFindings, setTurns],
  );

  const newChat = useCallback(() => {
    clearThread();
  }, [clearThread]);

  return {
    sessions,
    current,
    findings,
    turns,
    running,
    loading,
    error,
    loadSessions,
    ask,
    selectSession,
    newChat,
  };
}
