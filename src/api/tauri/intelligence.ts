/**
 * Typed Tauri IPC wrappers for Intelligence Spine commands.
 *
 * These are the ONLY entry points for Tauri `invoke` calls related to
 * intelligence findings and action audit. Components and pages MUST NOT call
 * `invoke` directly (doc 48 AC-FS-04).
 *
 * Command names are snake_case (Tauri convention).
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  ActionAuditEntry,
  CleanupResult,
  CopilotStatus,
  DashboardIntelligence,
  IntelligenceFinding,
  LocalQwenInstallProgress,
} from '../../types/device.types';

/** Fetch the dashboard intelligence read model (findings + top processes). */
export const getDashboardIntelligence = (): Promise<DashboardIntelligence> =>
  invoke<DashboardIntelligence>('get_dashboard_intelligence');

/** List intelligence findings, optionally including dismissed ones. */
export const listIntelligenceFindings = (
  includeDismissed = false,
): Promise<IntelligenceFinding[]> =>
  invoke<IntelligenceFinding[]>('list_intelligence_findings', {
    includeDismissed,
  });

/** Dismiss a finding so it no longer appears in the open feed. */
export const dismissFinding = (findingId: string): Promise<void> =>
  invoke<void>('dismiss_finding', { findingId });

/** List action audit rows, newest first. */
export const listActionAudit = (): Promise<ActionAuditEntry[]> =>
  invoke<ActionAuditEntry[]>('list_action_audit');

/** Propose a dry-run safe cleanup preview (no file deletion). */
export const proposeSafeCleanup = (): Promise<ActionAuditEntry> =>
  invoke<ActionAuditEntry>('propose_safe_cleanup');

/**
 * Execute safe temp/cache cleanup. Requires explicit `confirm: true`.
 * Without confirmation the backend rejects the request.
 */
export const executeSafeCleanup = (confirm: boolean): Promise<CleanupResult> =>
  invoke<CleanupResult>('execute_safe_cleanup', { confirm });

/** Local Qwen3 / heuristic Copilot status (no cloud providers). */
export const getCopilotStatus = (): Promise<CopilotStatus> =>
  invoke<CopilotStatus>('get_copilot_status');

/** Start in-app download of llama-server + Qwen3 (~640 MB). */
export const startLocalQwenInstall = (): Promise<LocalQwenInstallProgress> =>
  invoke<LocalQwenInstallProgress>('start_local_qwen_install');

/** Poll in-app local model install progress. */
export const getLocalQwenInstallProgress =
  (): Promise<LocalQwenInstallProgress> =>
    invoke<LocalQwenInstallProgress>('get_local_qwen_install_progress');
