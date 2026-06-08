import { useEffect, useState } from 'react';
import { useDeviceDna } from '../hooks/use-device-dna';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { Card } from '../components/common/Card';
import { SnapshotList } from '../components/device/SnapshotList';
import { SoftwareInventoryTable } from '../components/device/SoftwareInventoryTable';
import { ConfigItemsTable } from '../components/device/ConfigItemsTable';

type DetailTab = 'software' | 'config';

/**
 * Device DNA page — vertical slice for Increment 2.
 *
 * Layout: header with Capture button | left snapshot list | right detail pane.
 * The detail pane has a Software / System configuration tab toggle.
 * All data access goes through `useDeviceDna`; no direct `invoke` calls here.
 */
export function DeviceDNA() {
  const {
    snapshots,
    selectedSnapshotId,
    inventory,
    loadingSnapshots,
    loadingInventory,
    configItems,
    loadingConfig,
    capturing,
    error,
    loadSnapshots,
    capture,
    selectSnapshot,
  } = useDeviceDna();

  const [activeTab, setActiveTab] = useState<DetailTab>('software');

  // Load snapshots on mount.
  useEffect(() => {
    void loadSnapshots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCapture = () => {
    void capture();
  };

  // Resolve counts from the selected snapshot record (authoritative source).
  const selectedSnapshot = snapshots.find((s) => s.id === selectedSnapshotId);
  const softwareCount = selectedSnapshot?.softwareCount ?? inventory.length;
  const configCount = selectedSnapshot?.configCount ?? configItems.length;

  const isDetailLoading =
    activeTab === 'software' ? loadingInventory : loadingConfig;

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <header className="flex items-center justify-between gap-4 border-b border-surface-border bg-surface-card px-6 py-4 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">
            Device DNA
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Point-in-time snapshots of your installed software and system
            configuration.
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

        {/* Right: Detail pane */}
        <section className="flex-1 flex flex-col overflow-hidden">
          {selectedSnapshotId === null && !loadingSnapshots ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                heading="No snapshot selected"
                body="Select a snapshot from the list to view its details."
              />
            </div>
          ) : isDetailLoading ? (
            <div className="flex flex-1 items-center justify-center gap-3">
              <Spinner label="Loading…" />
              <p className="text-sm text-text-secondary">
                {activeTab === 'software'
                  ? 'Loading software inventory…'
                  : 'Loading system configuration…'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col flex-1 overflow-hidden pt-3">
              {/* Snapshot info + tab toggle */}
              <div className="px-4 pb-2 flex-shrink-0 flex items-center gap-3 flex-wrap">
                <Card padding="sm" className="inline-flex items-center gap-2">
                  <span className="text-xs text-text-secondary font-medium">
                    Snapshot
                  </span>
                  <span className="font-mono text-xs text-text-primary">
                    #{selectedSnapshotId?.slice(0, 8) ?? '—'}
                  </span>
                  <span className="text-text-muted">·</span>
                  <span className="text-xs text-text-secondary">
                    {softwareCount} apps
                  </span>
                  <span className="text-text-muted">·</span>
                  <span className="text-xs text-text-secondary">
                    {configCount} config
                  </span>
                </Card>

                {/* Tab toggle */}
                <div
                  className="inline-flex rounded border border-surface-border bg-surface overflow-hidden"
                  role="tablist"
                  aria-label="Detail view"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'software'}
                    onClick={() => setActiveTab('software')}
                    className={[
                      'px-3 py-1.5 text-xs font-medium transition-colors duration-100',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                      activeTab === 'software'
                        ? 'bg-accent text-white'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-border',
                    ].join(' ')}
                  >
                    Software
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'config'}
                    onClick={() => setActiveTab('config')}
                    className={[
                      'px-3 py-1.5 text-xs font-medium transition-colors duration-100 border-l border-surface-border',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                      activeTab === 'config'
                        ? 'bg-accent text-white'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-border',
                    ].join(' ')}
                  >
                    System configuration
                  </button>
                </div>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-hidden" role="tabpanel">
                {activeTab === 'software' ? (
                  <SoftwareInventoryTable items={inventory} />
                ) : (
                  <ConfigItemsTable items={configItems} />
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
