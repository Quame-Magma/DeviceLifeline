/**
 * `useDiagnosis` — custom hook for AI Detective IPC calls.
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
  type DiagnosisStore,
} from '../store/diagnosis.store';
import type { DiagnosisSession } from '../types/device.types';

export interface UseDiagnosisReturn {
  sessions: DiagnosisStore['sessions'];
  current: DiagnosisStore['current'];
  findings: DiagnosisStore['findings'];
  running: DiagnosisStore['running'];
  loading: DiagnosisStore['loading'];
  error: DiagnosisStore['error'];
  /** Load (or reload) the session history. */
  loadSessions: () => Promise<void>;
  /** Run a diagnosis for the query, then show it and refresh history. */
  ask: (query: string) => Promise<void>;
  /** Show a past session and load its findings. */
  selectSession: (session: DiagnosisSession) => Promise<void>;
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

export function useDiagnosis(): UseDiagnosisReturn {
  const {
    sessions,
    current,
    findings,
    running,
    loading,
    error,
    setSessions,
    setCurrent,
    setFindings,
    setRunning,
    setLoading,
    setError,
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
      setRunning(true);
      setError(null);
      try {
        const session = await apiRunDiagnosis(query);
        setCurrent(session);
        setFindings(await getDiagnosisFindings(session.id));
        setSessions(await getDiagnosisSessions());
      } catch (err) {
        setError(toMessage(err, 'Diagnosis failed.'));
      } finally {
        setRunning(false);
      }
    },
    [setCurrent, setError, setFindings, setRunning, setSessions],
  );

  const selectSession = useCallback(
    async (session: DiagnosisSession) => {
      setCurrent(session);
      setError(null);
      try {
        setFindings(await getDiagnosisFindings(session.id));
      } catch (err) {
        setError(toMessage(err, 'Failed to load findings.'));
        setFindings([]);
      }
    },
    [setCurrent, setError, setFindings],
  );

  return {
    sessions,
    current,
    findings,
    running,
    loading,
    error,
    loadSessions,
    ask,
    selectSession,
  };
}
