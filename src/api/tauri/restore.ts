/**
 * Typed Tauri IPC wrappers for restore-related commands.
 *
 * These are the ONLY entry points for Tauri `invoke` calls related to restore.
 * Components and pages MUST NOT call `invoke` directly (doc 48 AC-FS-04).
 *
 * Command names are snake_case (Tauri convention).
 * Argument keys are camelCase; Tauri v2 maps them to snake_case Rust params.
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  RestorePlan,
  RestorePlanStep,
  RestoreJob,
  RestoreStepResult,
} from '../../types/device.types';

/** Create a restore plan from a given snapshot's software inventory. */
export const createRestorePlan = (snapshotId: string): Promise<RestorePlan> =>
  invoke<RestorePlan>('create_restore_plan', { snapshotId });

/** Retrieve all restore plans, newest first. */
export const getRestorePlans = (): Promise<RestorePlan[]> =>
  invoke<RestorePlan[]>('get_restore_plans');

/** Retrieve all steps for a restore plan, ordered by order_index. */
export const getRestorePlanSteps = (
  planId: string,
): Promise<RestorePlanStep[]> =>
  invoke<RestorePlanStep[]>('get_restore_plan_steps', { planId });

/**
 * Execute a restore plan synchronously and return the finished job.
 * On Windows this triggers real WinGet installs.
 */
export const runRestore = (planId: string): Promise<RestoreJob> =>
  invoke<RestoreJob>('run_restore', { planId });

/** Retrieve all restore jobs, newest first. */
export const getRestoreJobs = (): Promise<RestoreJob[]> =>
  invoke<RestoreJob[]>('get_restore_jobs');

/** Retrieve all step results for a restore job. */
export const getRestoreStepResults = (
  jobId: string,
): Promise<RestoreStepResult[]> =>
  invoke<RestoreStepResult[]>('get_restore_step_results', { jobId });
