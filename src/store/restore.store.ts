/**
 * Zustand store for Recovery Center / restore state.
 *
 * This store holds all shared state for restore plans, jobs, and step results.
 * It must NOT contain API calls — those live in `hooks/use-recovery.ts`.
 */

import { create } from 'zustand';
import type {
  RestorePlan,
  RestorePlanStep,
  RestoreJob,
  RestoreStepResult,
} from '../types/device.types';

export interface RestoreStore {
  /** All restore plans, newest first. */
  plans: RestorePlan[];
  /** The ID of the currently selected plan, or null if none. */
  selectedPlanId: string | null;
  /** Steps for the currently selected plan. */
  planSteps: RestorePlanStep[];
  /** The most recent restore job for the selected plan, or null. */
  latestJob: RestoreJob | null;
  /** Step results for the latest job. */
  stepResults: RestoreStepResult[];
  /** True while a restore job is executing. */
  running: boolean;
  /** True while fetching the plan list. */
  loadingPlans: boolean;
  /** Error message from the most recent failed operation, or null. */
  error: string | null;

  // Actions
  setPlans: (plans: RestorePlan[]) => void;
  setSelectedPlanId: (id: string | null) => void;
  setPlanSteps: (steps: RestorePlanStep[]) => void;
  setLatestJob: (job: RestoreJob | null) => void;
  setStepResults: (results: RestoreStepResult[]) => void;
  setRunning: (running: boolean) => void;
  setLoadingPlans: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useRestoreStore = create<RestoreStore>((set) => ({
  plans: [],
  selectedPlanId: null,
  planSteps: [],
  latestJob: null,
  stepResults: [],
  running: false,
  loadingPlans: false,
  error: null,

  setPlans: (plans) => set({ plans }),
  setSelectedPlanId: (id) => set({ selectedPlanId: id }),
  setPlanSteps: (steps) => set({ planSteps: steps }),
  setLatestJob: (job) => set({ latestJob: job }),
  setStepResults: (results) => set({ stepResults: results }),
  setRunning: (running) => set({ running }),
  setLoadingPlans: (loading) => set({ loadingPlans: loading }),
  setError: (error) => set({ error }),
}));
