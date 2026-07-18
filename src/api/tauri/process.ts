/**
 * Typed Tauri IPC wrappers for Process Intelligence commands.
 *
 * These are the ONLY entry points for Tauri `invoke` calls related to process
 * listing and control. Components and pages MUST NOT call `invoke` directly.
 *
 * Command names are snake_case (Tauri convention).
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  ProcessDeepDetail,
  ProcessInfo,
  ProcessKillResult,
  ProcessSnapshot,
  ProcessTreeNode,
  ServiceInfo,
} from '../../types/device.types';

/** List running processes with risk classification, highest impact first. */
export const listProcesses = (topN?: number): Promise<ProcessSnapshot> =>
  invoke<ProcessSnapshot>('list_processes', { topN: topN ?? null });

/** Process tree forest for explorer tree views. */
export const getProcessTree = (max?: number): Promise<ProcessTreeNode[]> =>
  invoke<ProcessTreeNode[]>('get_process_tree', { max: max ?? null });

/** Detail for a single process id, or null when not found. */
export const getProcessDetail = (pid: number): Promise<ProcessInfo | null> =>
  invoke<ProcessInfo | null>('get_process_detail', { pid });

/**
 * Deep process detail: memory regions, wait chains, token, named handles.
 * Full results may require running elevated.
 */
export const getProcessDeep = (pid: number): Promise<ProcessDeepDetail> =>
  invoke<ProcessDeepDetail>('get_process_deep', { pid });

/**
 * Terminate a process. Requires `confirm: true`.
 * Optional `tree` ends the process and its descendants.
 * Protected system processes may be refused by the backend.
 */
export const killProcess = (
  pid: number,
  confirm: boolean,
  tree?: boolean,
): Promise<ProcessKillResult> =>
  invoke<ProcessKillResult>('kill_process', {
    pid,
    confirm,
    tree: tree ?? false,
  });

/** Windows services inventory for the Process Explorer services tab. */
export const listServices = (): Promise<ServiceInfo[]> =>
  invoke<ServiceInfo[]>('list_services');
