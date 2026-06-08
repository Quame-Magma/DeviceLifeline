/**
 * `useRecovery` — custom hook that encapsulates all Recovery Center API calls.
 *
 * Components and pages MUST use this hook to interact with restore data.
 * They must NOT import from `src/api/tauri/restore.ts` directly (doc 48 AC-FS-04).
 */

import { useCallback } from 'react';
import {
  createRestorePlan,
  getRestorePlans,
  getRestorePlanSteps,
  runRestore as apiRunRestore,
  getRestoreStepResults,
} from '../api/tauri/restore';
import { useRestoreStore, type RestoreStore } from '../store/restore.store';

export interface UseRecoveryReturn {
  plans: RestoreStore['plans'];
  selectedPlanId: RestoreStore['selectedPlanId'];
  planSteps: RestoreStore['planSteps'];
  latestJob: RestoreStore['latestJob'];
  stepResults: RestoreStore['stepResults'];
  running: RestoreStore['running'];
  loadingPlans: RestoreStore['loadingPlans'];
  error: RestoreStore['error'];
  /** Load (or reload) the list of restore plans. */
  loadPlans: () => Promise<void>;
  /** Create a new restore plan from the given snapshot, reload plans, and select it. */
  createPlan: (snapshotId: string) => Promise<void>;
  /** Select a plan by ID and load its steps; clears previous step results. */
  selectPlan: (planId: string) => Promise<void>;
  /** Run the selected restore plan and store the resulting job + step results. */
  runRestore: (planId: string) => Promise<void>;
}

export function useRecovery(): UseRecoveryReturn {
  const {
    plans,
    selectedPlanId,
    planSteps,
    latestJob,
    stepResults,
    running,
    loadingPlans,
    error,
    setPlans,
    setSelectedPlanId,
    setPlanSteps,
    setLatestJob,
    setStepResults,
    setRunning,
    setLoadingPlans,
    setError,
  } = useRestoreStore();

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true);
    setError(null);
    try {
      const fetched = await getRestorePlans();
      setPlans(fetched);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Failed to load restore plans.',
      );
      setPlans([]);
    } finally {
      setLoadingPlans(false);
    }
  }, [setError, setLoadingPlans, setPlans]);

  const loadStepsForPlan = useCallback(
    async (planId: string) => {
      try {
        const steps = await getRestorePlanSteps(planId);
        setPlanSteps(steps);
      } catch {
        setPlanSteps([]);
      }
    },
    [setPlanSteps],
  );

  const createPlan = useCallback(
    async (snapshotId: string) => {
      setError(null);
      try {
        const plan = await createRestorePlan(snapshotId);
        // Reload the full list so it stays sorted.
        const fetched = await getRestorePlans();
        setPlans(fetched);
        // Auto-select the newly created plan.
        setSelectedPlanId(plan.id);
        setLatestJob(null);
        setStepResults([]);
        await loadStepsForPlan(plan.id);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : 'Failed to create restore plan.',
        );
      }
    },
    [
      loadStepsForPlan,
      setError,
      setLatestJob,
      setPlans,
      setSelectedPlanId,
      setStepResults,
    ],
  );

  const selectPlan = useCallback(
    async (planId: string) => {
      setSelectedPlanId(planId);
      setLatestJob(null);
      setStepResults([]);
      await loadStepsForPlan(planId);
    },
    [loadStepsForPlan, setLatestJob, setSelectedPlanId, setStepResults],
  );

  const runRestore = useCallback(
    async (planId: string) => {
      setRunning(true);
      setError(null);
      try {
        const job = await apiRunRestore(planId);
        setLatestJob(job);
        const results = await getRestoreStepResults(job.id);
        setStepResults(results);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : 'Restore failed.',
        );
      } finally {
        setRunning(false);
      }
    },
    [setError, setLatestJob, setRunning, setStepResults],
  );

  return {
    plans,
    selectedPlanId,
    planSteps,
    latestJob,
    stepResults,
    running,
    loadingPlans,
    error,
    loadPlans,
    createPlan,
    selectPlan,
    runRestore,
  };
}
