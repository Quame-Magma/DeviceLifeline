import { useEffect, useState } from 'react';
import { useDeviceDna } from '../hooks/use-device-dna';
import { useRecovery } from '../hooks/use-recovery';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { RestorePlanList } from '../components/restore/RestorePlanList';
import { RestorePlanStepsTable } from '../components/restore/RestorePlanStepsTable';
import { RestoreJobResult } from '../components/restore/RestoreJobResult';

/**
 * Recovery Center page — Increment 4.
 *
 * Layout:
 *   Header: snapshot picker + "Create restore plan" button.
 *   Left panel: list of restore plans.
 *   Right panel: selected plan steps + "Run restore" button + latest job result.
 *
 * NOTE: Clicking "Run restore" on Windows performs real WinGet package installations.
 * On non-Windows platforms the mock installer is used and no changes are made to the OS.
 */
export function RecoveryCenter() {
  const { snapshots, loadingSnapshots, loadSnapshots } = useDeviceDna();
  const {
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
  } = useRecovery();

  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('');

  // Load snapshots and plans on mount.
  useEffect(() => {
    void loadSnapshots();
    void loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default snapshot picker to first snapshot when loaded.
  useEffect(() => {
    if (snapshots.length > 0 && selectedSnapshotId === '') {
      setSelectedSnapshotId(snapshots[0].id);
    }
  }, [snapshots, selectedSnapshotId]);

  const handleCreatePlan = () => {
    if (selectedSnapshotId) {
      void createPlan(selectedSnapshotId);
    }
  };

  const handleRunRestore = () => {
    if (selectedPlanId) {
      void runRestore(selectedPlanId);
    }
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <header className="flex items-center justify-between gap-4 border-b border-surface-border bg-surface-card px-6 py-4 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">
            Recovery Center
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Generate and execute restore plans from your device snapshots.
          </p>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="mx-6 mt-4 flex items-start gap-3 rounded border border-status-error/30 bg-status-error-bg px-4 py-3 text-sm text-status-error flex-shrink-0"
        >
          <span aria-hidden="true" className="mt-0.5 text-base">
            ⚠
          </span>
          <div className="flex-1">
            <p className="font-medium">Something went wrong</p>
            <p className="text-status-error/80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Snapshot picker + create plan */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-surface-border bg-surface flex-shrink-0">
        <label
          htmlFor="snapshot-picker"
          className="text-sm font-medium text-text-secondary whitespace-nowrap"
        >
          Snapshot:
        </label>
        {loadingSnapshots ? (
          <Spinner size="sm" label="Loading snapshots" />
        ) : snapshots.length === 0 ? (
          <span className="text-sm text-text-muted italic">
            No snapshots available — capture one first.
          </span>
        ) : (
          <select
            id="snapshot-picker"
            value={selectedSnapshotId}
            onChange={(e) => setSelectedSnapshotId(e.target.value)}
            className={[
              'rounded border border-surface-border bg-white px-3 py-1.5',
              'text-sm text-text-primary',
              'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent',
              'transition-colors duration-150',
            ].join(' ')}
          >
            {snapshots.map((snap) => (
              <option key={snap.id} value={snap.id}>
                {snap.capturedAt.slice(0, 19).replace('T', ' ')} (
                {snap.softwareCount} apps)
              </option>
            ))}
          </select>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={handleCreatePlan}
          disabled={!selectedSnapshotId || loadingSnapshots}
        >
          Create restore plan from selected snapshot
        </Button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 gap-0 overflow-hidden">
        {/* Left: Plan list */}
        <aside className="w-[260px] flex-shrink-0 border-r border-surface-border flex flex-col overflow-y-auto scrollbar-thin bg-surface-card">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-surface-border flex-shrink-0">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              Restore plans
            </span>
            {loadingPlans && <Spinner size="sm" label="Loading plans" />}
          </div>

          {loadingPlans && plans.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner label="Loading plans…" />
            </div>
          ) : (
            <RestorePlanList
              plans={plans}
              selectedId={selectedPlanId}
              onSelect={(id) => void selectPlan(id)}
            />
          )}
        </aside>

        {/* Right: Plan detail + job result */}
        <section className="flex-1 flex flex-col overflow-hidden">
          {selectedPlan === null ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                heading="No plan selected"
                body="Select a restore plan from the list, or create one from a snapshot."
              />
            </div>
          ) : (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Plan header + run button */}
              <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-surface-border flex-shrink-0">
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    {selectedPlan.name}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {selectedPlan.stepCount} steps &middot; created{' '}
                    {selectedPlan.createdAt.slice(0, 10)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 max-w-[260px]">
                    On Windows, this performs real WinGet installations. Use
                    with care.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={running}
                    onClick={handleRunRestore}
                    disabled={running || planSteps.length === 0}
                  >
                    {running ? 'Running…' : 'Run restore'}
                  </Button>
                </div>
              </div>

              {/* Steps table */}
              <div className="flex-1 overflow-hidden flex flex-col">
                <div
                  className={latestJob ? 'h-1/2 overflow-hidden border-b border-surface-border' : 'flex-1 overflow-hidden'}
                >
                  <RestorePlanStepsTable steps={planSteps} />
                </div>

                {/* Latest job result */}
                {latestJob && (
                  <div className="h-1/2 overflow-auto px-5 py-4 scrollbar-thin">
                    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
                      Latest job result
                    </p>
                    <RestoreJobResult
                      job={latestJob}
                      stepResults={stepResults}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
