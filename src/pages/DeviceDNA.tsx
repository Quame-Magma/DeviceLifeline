import { useEffect } from 'react';
import { useDeviceDna } from '../hooks/use-device-dna';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { Card } from '../components/common/Card';
import { SnapshotList } from '../components/device/SnapshotList';
import { SoftwareInventoryTable } from '../components/device/SoftwareInventoryTable';

/**
 * Device DNA page — vertical slice for Increment 1.
 *
 * Layout: header with Capture button | left snapshot list | right inventory table.
 * All data access goes through `useDeviceDna`; no direct `invoke` calls here.
 */
export function DeviceDNA() {
  const {
    snapshots,
    selectedSnapshotId,
    inventory,
    loadingSnapshots,
    loadingInventory,
    capturing,
    error,
    loadSnapshots,
    capture,
    selectSnapshot,
  } = useDeviceDna();

  // Load snapshots on mount.
  useEffect(() => {
    void loadSnapshots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCapture = () => {
    void capture();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <header className="flex items-center justify-between gap-4 border-b border-surface-border bg-surface-card px-6 py-4 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">
            Device DNA
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Point-in-time snapshots of your installed software.
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          loading={capturing}
          onClick={handleCapture}
          disabled={capturing}
        >
          {capturing ? 'Capturing…' : 'Capture snapshot'}
        </Button>
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
          <button
            type="button"
            onClick={() => void loadSnapshots()}
            className="text-status-error underline hover:no-underline text-xs shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 gap-0 overflow-hidden">
        {/* Left: Snapshot list panel */}
        <aside className="w-[220px] flex-shrink-0 border-r border-surface-border flex flex-col overflow-y-auto scrollbar-thin bg-surface-card">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-surface-border flex-shrink-0">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              Snapshots
            </span>
            {loadingSnapshots && <Spinner size="sm" label="Loading snapshots" />}
          </div>

          {loadingSnapshots && snapshots.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner label="Loading snapshots…" />
            </div>
          ) : snapshots.length === 0 ? (
            <EmptyState
              heading="No snapshots yet"
              body="Capture one to start building your device's digital history."
              className="py-10 px-3"
            />
          ) : (
            <SnapshotList
              snapshots={snapshots}
              selectedId={selectedSnapshotId}
              onSelect={(id) => void selectSnapshot(id)}
            />
          )}
        </aside>

        {/* Right: Software inventory panel */}
        <section className="flex-1 flex flex-col overflow-hidden">
          {selectedSnapshotId === null && !loadingSnapshots ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                heading="No snapshot selected"
                body="Select a snapshot from the list to view its software inventory."
              />
            </div>
          ) : loadingInventory ? (
            <div className="flex flex-1 items-center justify-center gap-3">
              <Spinner label="Loading inventory…" />
              <p className="text-sm text-text-secondary">
                Loading software inventory…
              </p>
            </div>
          ) : (
            <div className="flex flex-col flex-1 overflow-hidden pt-3">
              <div className="px-4 pb-2 flex-shrink-0">
                <Card padding="sm" className="inline-flex items-center gap-2">
                  <span className="text-xs text-text-secondary font-medium">
                    Snapshot
                  </span>
                  <span className="font-mono text-xs text-text-primary">
                    #{selectedSnapshotId?.slice(0, 8) ?? '—'}
                  </span>
                  <span className="text-text-muted">·</span>
                  <span className="text-xs text-text-secondary">
                    {inventory.length} items
                  </span>
                </Card>
              </div>
              <div className="flex-1 overflow-hidden">
                <SoftwareInventoryTable items={inventory} />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
