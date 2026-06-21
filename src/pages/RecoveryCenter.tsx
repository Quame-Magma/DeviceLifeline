import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useDeviceDna } from '../hooks/use-device-dna';
import { useRecovery } from '../hooks/use-recovery';
import { useSetup } from '../hooks/use-setup';
import { bundleToJson, setupFilename } from '../lib/setup';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { RestorePlanList } from '../components/restore/RestorePlanList';
import { RestorePlanStepsTable } from '../components/restore/RestorePlanStepsTable';
import { RestoreJobResult } from '../components/restore/RestoreJobResult';
import type { RestoreRunMode } from '../api/tauri/restore';

/**
 * Recovery Center page — Increment 4.
 *
 * Layout:
 *   Header: snapshot picker + "Create restore plan" button.
 *   Left panel: list of restore plans.
 *   Right panel: selected plan steps + "Run restore" button + latest job result.
 *
 * Restore defaults to simulation mode. Real WinGet installs require explicit
 * opt-in and confirmation.
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

  const { exporting, importing, error: setupError, exportSetup, importSetup } =
    useSetup();

  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('');
  const [restoreMode, setRestoreMode] =
    useState<RestoreRunMode>('dryRun');
  const [confirmRealInstall, setConfirmRealInstall] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

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
      void runRestore(selectedPlanId, restoreMode);
    }
  };

  // Export the selected snapshot as a downloadable .dlsetup bundle.
  const handleExport = async () => {
    if (!selectedSnapshotId) {
      return;
    }
    const bundle = await exportSetup(selectedSnapshotId);
    if (!bundle) {
      return;
    }
    const blob = new Blob([bundleToJson(bundle)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = setupFilename(bundle);
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // Import a .dlsetup bundle from disk; on success refresh the snapshot list.
  const handleImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      void importSetup(text).then((snapshot) => {
        if (snapshot) {
          void loadSnapshots();
        }
      });
    };
    reader.readAsText(file);
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;
  const realInstallMode = restoreMode === 'install';
  const unresolvedStepCount = planSteps.filter((step) => !step.wingetId).length;
  const canRunRestore =
    selectedPlanId !== null &&
    planSteps.length > 0 &&
    !running &&
    (!realInstallMode || confirmRealInstall);

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <header className="flex items-center justify-between gap-4 border-b border-surface-border bg-surface-card px-6 py-4 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">
            Recovery Center
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Generate, simulate, and execute restore plans from your device snapshots.
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

        {/* Setup export / import */}
        <div className="ml-auto flex items-center gap-2">
          {setupError && (
            <span className="max-w-[220px] truncate text-xs text-status-error">
              {setupError}
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            loading={exporting}
            onClick={() => void handleExport()}
            disabled={!selectedSnapshotId || exporting}
          >
            Export .dlsetup
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={importing}
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
          >
            Import .dlsetup
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".dlsetup,application/json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
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
                    {unresolvedStepCount > 0
                      ? ` · ${unresolvedStepCount} need package review`
                      : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <label className="inline-flex items-center gap-2 rounded border border-surface-border bg-white px-2 py-1 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={realInstallMode}
                      onChange={(event) => {
                        setRestoreMode(event.target.checked ? 'install' : 'dryRun');
                        setConfirmRealInstall(false);
                      }}
                      className="h-3.5 w-3.5 rounded border-surface-border text-accent focus:ring-accent"
                    />
                    Real WinGet install
                  </label>
                  {realInstallMode ? (
                    <label className="inline-flex max-w-[300px] items-center gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                      <input
                        type="checkbox"
                        checked={confirmRealInstall}
                        onChange={(event) =>
                          setConfirmRealInstall(event.target.checked)
                        }
                        className="h-3.5 w-3.5 rounded border-amber-300 text-amber-700 focus:ring-amber-500"
                      />
                      I understand this will install apps on this PC.
                    </label>
                  ) : (
                    <p className="text-xs text-status-success bg-status-success-bg border border-status-success/20 rounded px-2 py-1 max-w-[300px]">
                      Simulation mode records what would happen without changing this PC.
                    </p>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    loading={running}
                    onClick={handleRunRestore}
                    disabled={!canRunRestore}
                  >
                    {running
                      ? 'Running…'
                      : realInstallMode
                        ? 'Run real install'
                        : 'Simulate restore'}
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
