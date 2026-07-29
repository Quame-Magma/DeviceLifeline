import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useDeviceDna } from '../hooks/use-device-dna';
import { useRecovery } from '../hooks/use-recovery';
import { useSetup } from '../hooks/use-setup';
import { bundleToJson, setupFilename } from '../lib/setup';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { RestorePlanList } from '../components/restore/RestorePlanList';
import { RestorePlanStepsTable } from '../components/restore/RestorePlanStepsTable';
import { RestoreJobResult } from '../components/restore/RestoreJobResult';
import type { RestoreRunMode } from '../api/tauri/restore';
import { PageShell } from '../components/layout/PageShell';
import { confirmAction } from '../lib/feedback';

/**
 * Recovery Center page - Increment 4.
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

  const {
    exporting,
    importing,
    error: setupError,
    exportSetup,
    importSetup,
  } = useSetup();

  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('');
  const [restoreMode, setRestoreMode] = useState<RestoreRunMode>('dryRun');
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

  const handleRunRestore = async () => {
    if (!selectedPlanId) return;
    if (restoreMode === 'install') {
      const ok = await confirmAction({
        title: 'Install packages from restore plan?',
        description:
          'This will run real WinGet installs for plan steps. Prefer dry-run first. Continue only if you trust this plan.',
        confirmLabel: 'Install',
        tone: 'danger',
      });
      if (!ok) return;
    }
    void runRestore(selectedPlanId, restoreMode);
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
    <PageShell
      title="Recovery"
      description="Build and simulate restore plans from device baselines."
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            loading={exporting}
            onClick={() => void handleExport()}
            disabled={!selectedSnapshotId || exporting}
          >
            Export
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={importing}
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
          >
            Import
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".dlsetup,application/json"
            className="hidden"
            onChange={handleImportFile}
          />
        </>
      }
      className="flex min-h-0 flex-1 flex-col"
    >
      {error ? (
        <AlertBanner title="Something went wrong" message={error} />
      ) : null}
      {setupError ? (
        <AlertBanner title="Setup import/export failed" message={setupError} />
      ) : null}

      <div className="panel flex flex-wrap items-center gap-3 px-panel-x py-3">
        <label
          htmlFor="snapshot-picker"
          className="whitespace-nowrap text-xs font-medium text-text-muted"
        >
          Snapshot
        </label>
        {loadingSnapshots ? (
          <Spinner size="sm" label="Loading snapshots" />
        ) : snapshots.length === 0 ? (
          <span className="text-sm text-text-muted">
            No snapshots — capture a baseline first.
          </span>
        ) : (
          <select
            id="snapshot-picker"
            value={selectedSnapshotId}
            onChange={(e) => setSelectedSnapshotId(e.target.value)}
            className="field max-w-xs"
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
          Create plan
        </Button>
      </div>

      <div className="panel flex min-h-[480px] flex-1 overflow-hidden">
        <aside className="flex w-[240px] flex-shrink-0 flex-col overflow-y-auto border-r border-hairline scrollbar-thin">
          <div className="panel-header flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">
              Plans
            </span>
            {loadingPlans ? <Spinner size="sm" label="Loading plans" /> : null}
          </div>

          {loadingPlans && plans.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner label="Loading plans..." />
            </div>
          ) : (
            <RestorePlanList
              plans={plans}
              selectedId={selectedPlanId}
              onSelect={(id) => void selectPlan(id)}
            />
          )}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selectedPlan === null ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                heading="No plan selected"
                body="Select a restore plan from the list, or create one from a snapshot."
              />
            </div>
          ) : (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex flex-shrink-0 flex-col gap-3 border-b border-hairline px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    {selectedPlan.name}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {selectedPlan.stepCount} steps · created{' '}
                    {selectedPlan.createdAt.slice(0, 10)}
                    {unresolvedStepCount > 0
                      ? ` · ${unresolvedStepCount} need package review`
                      : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <label className="inline-flex items-center gap-2 rounded border border-hairline bg-surface-elevated px-2 py-1 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={realInstallMode}
                      onChange={(event) => {
                        setRestoreMode(
                          event.target.checked ? 'install' : 'dryRun',
                        );
                        setConfirmRealInstall(false);
                      }}
                      className="h-3.5 w-3.5 rounded border-surface-border text-text-primary focus:ring-white/25"
                    />
                    Real WinGet install
                  </label>
                  {realInstallMode ? (
                    <label className="inline-flex max-w-[300px] items-center gap-2 rounded border border-status-warning/30 bg-status-warning-bg px-2 py-1 text-xs text-status-warning">
                      <input
                        type="checkbox"
                        checked={confirmRealInstall}
                        onChange={(event) =>
                          setConfirmRealInstall(event.target.checked)
                        }
                        className="h-3.5 w-3.5 rounded border-status-warning/40 text-status-warning focus:ring-status-warning"
                      />
                      I understand this will install apps on this PC.
                    </label>
                  ) : (
                    <p className="max-w-[300px] rounded border border-status-success/20 bg-status-success-bg px-2 py-1 text-xs text-status-success">
                      Simulation mode records what would happen without changing
                      this PC.
                    </p>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    loading={running}
                    onClick={() => {
                      void handleRunRestore();
                    }}
                    disabled={!canRunRestore}
                  >
                    {running
                      ? 'Running...'
                      : realInstallMode
                        ? 'Run real install'
                        : 'Simulate restore'}
                  </Button>
                </div>
              </div>

              <div className="flex flex-1 flex-col overflow-hidden">
                <div
                  className={
                    latestJob
                      ? 'h-1/2 overflow-hidden border-b border-surface-border'
                      : 'flex-1 overflow-hidden'
                  }
                >
                  <RestorePlanStepsTable steps={planSteps} />
                </div>

                {latestJob && (
                  <div className="h-1/2 overflow-auto px-5 py-4 scrollbar-thin">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
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
    </PageShell>
  );
}
