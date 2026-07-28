/**
 * Typed Tauri IPC wrappers for AI Detective commands.
 *
 * These are the ONLY entry points for Tauri `invoke` calls related to
 * diagnosis. Components and pages MUST NOT call `invoke` directly (doc 48
 * AC-FS-04). Command names are snake_case; argument keys are camelCase.
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  DiagnosisFinding,
  DiagnosisSession,
} from '../../types/device.types';

/**
 * Run a diagnosis for a query; returns the persisted session.
 * Optional `history` is prior chat turns so replies stay multi-turn aware.
 */
export const runDiagnosis = (
  query: string,
  history?: string | null,
): Promise<DiagnosisSession> =>
  invoke<DiagnosisSession>('run_diagnosis', {
    query,
    history: history ?? null,
  });

/** Retrieve all diagnosis sessions, newest first. */
export const getDiagnosisSessions = (): Promise<DiagnosisSession[]> =>
  invoke<DiagnosisSession[]>('get_diagnosis_sessions');

/** Retrieve the findings for a diagnosis session, ordered by position. */
export const getDiagnosisFindings = (
  sessionId: string,
): Promise<DiagnosisFinding[]> =>
  invoke<DiagnosisFinding[]>('get_diagnosis_findings', { sessionId });
