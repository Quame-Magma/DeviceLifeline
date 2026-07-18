import { useEffect, useState } from 'react';
import { useDeviceDna } from '../hooks/use-device-dna';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { SegmentedControl } from '../components/common/SegmentedControl';
import { Spinner } from '../components/common/Spinner';
import { SnapshotList } from '../components/device/SnapshotList';
import { SoftwareInventoryTable } from '../components/device/SoftwareInventoryTable';
import { ConfigItemsTable } from '../components/device/ConfigItemsTable';
import { PageShell } from '../components/layout/PageShell';

type DetailTab = 'software' | 'config';

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

  useEffect(() => {
    void loadSnapshots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedSnapshot = snapshots.find((s) => s.id === selectedSnapshotId);
  const softwareCount = selectedSnapshot?.softwareCount ?? inventory.length;
  const configCount = selectedSnapshot?.configCount ?? configItems.length;
  const isDetailLoading =
    activeTab === 'software' ? loadingInventory : loadingConfig;

  return (
    <PageShell
      title="Baseline"
      description="Restore-relevant apps, extensions, tools, and system configuration."
      actions={
        <Button
          variant="primary"
          size="sm"
          loading={capturing}
          onClick={() => void capture()}
        >
          {capturing ? 'Capturing…' : 'Capture snapshot'}
        </Button>
      }
      className="flex min-h-0 flex-1 flex-col"
    >
      {error ? (
        <AlertBanner
          title="Something went wrong"
          message={error}
          onRetry={() => void loadSnapshots()}
        />
      ) : null}

      <div className="panel flex min-h-[480px] flex-1 overflow-hidden">
        <aside className="flex w-[200px] flex-shrink-0 flex-col overflow-y-auto border-r border-hairline scrollbar-thin">
          <div className="panel-header flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">
              Snapshots
            </span>
            {loadingSnapshots ? <Spinner size="sm" label="Loading" /> : null}
          </div>

          {loadingSnapshots && snapshots.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner label="Loading snapshots…" />
            </div>
          ) : snapshots.length === 0 ? (
            <EmptyState
              heading="No snapshots"
              body="Capture one to start history."
              className="px-3 py-10"
            />
          ) : (
            <SnapshotList
              snapshots={snapshots}
              selectedId={selectedSnapshotId}
              onSelect={(id) => void selectSnapshot(id)}
            />
          )}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selectedSnapshotId === null && !loadingSnapshots ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                heading="No snapshot selected"
                body="Select a snapshot to view software and config."
              />
            </div>
          ) : isDetailLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner label="Loading detail…" />
            </div>
          ) : (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
                <p className="text-xs text-text-muted">
                  <span className="font-mono text-text-secondary">
                    #{selectedSnapshotId?.slice(0, 8)}
                  </span>
                  <span className="mx-1.5">·</span>
                  {softwareCount} apps
                  <span className="mx-1.5">·</span>
                  {configCount} config
                </p>
                <SegmentedControl
                  ariaLabel="Detail view"
                  value={activeTab}
                  onChange={setActiveTab}
                  options={
                    [
                      { id: 'software', label: 'Software' },
                      { id: 'config', label: 'Config' },
                    ] as const
                  }
                />
              </div>
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
    </PageShell>
  );
}
