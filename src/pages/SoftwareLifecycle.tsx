import { useEffect, useMemo, useState } from 'react';
import { Package, RefreshCcw } from 'lucide-react';
import { useDeviceDna } from '../hooks/use-device-dna';
import { useUpdates } from '../hooks/use-updates';
import { useUninstall } from '../hooks/use-uninstall';
import { usePaginatedItems } from '../hooks/use-pagination';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Pagination } from '../components/common/Pagination';
import { SegmentedControl } from '../components/common/SegmentedControl';
import { Spinner } from '../components/common/Spinner';
import { StatRow, StatTile } from '../components/common/StatTile';
import { StatusPill } from '../components/common/StatusPill';
import { SoftwareInventoryTable } from '../components/device/SoftwareInventoryTable';
import { formatBytes, formatTimestamp } from '../lib/format';
import type { SoftwareUpdate } from '../types/device.types';
import { PageShell } from '../components/layout/PageShell';

type Tab = 'inventory' | 'updates' | 'uninstall';

/**
 * Software inventory + Patch My PC–class bulk update catalog.
 */
export function SoftwareLifecycle() {
  const {
    snapshots,
    selectedSnapshotId,
    inventory,
    loadingSnapshots,
    loadingInventory,
    capturing,
    error: dnaError,
    loadSnapshots,
    capture,
  } = useDeviceDna();
  const {
    updates,
    loading: updatesLoading,
    applying,
    error: updatesError,
    lastResult,
    load: loadUpdates,
    scan: scanUpdates,
    apply,
  } = useUpdates();
  const {
    apps,
    scan: leftoverScan,
    loading: appsLoading,
    acting: uninstallActing,
    error: uninstallError,
    message: uninstallMessage,
    load: loadApps,
    scanLeftovers,
    uninstall,
    removeLeftovers,
  } = useUninstall();

  const [tab, setTab] = useState<Tab>('updates');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [appQuery, setAppQuery] = useState('');

  useEffect(() => {
    void loadSnapshots();
    void loadUpdates();
  }, [loadSnapshots, loadUpdates]);

  useEffect(() => {
    if (tab === 'uninstall') void loadApps();
  }, [tab, loadApps]);

  const snapshot = snapshots.find((s) => s.id === selectedSnapshotId);
  const withVersion = inventory.filter((item) => item.version).length;
  const available = useMemo(
    () =>
      updates.filter((u) => u.status === 'available' || u.status === 'failed'),
    [updates],
  );
  const { pageItems, pagination } = usePaginatedItems(available);

  const filteredApps = useMemo(() => {
    const q = appQuery.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.publisher ?? '').toLowerCase().includes(q),
    );
  }, [apps, appQuery]);
  const { pageItems: pageApps, pagination: appPages } =
    usePaginatedItems(filteredApps);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllPage = () => {
    const ids = pageItems.map((u) => u.id);
    const allOn = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleApply = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Apply ${ids.length} update(s)?\n\nThis runs winget upgrade for each selected package. Continue?`,
    );
    if (!ok) return;
    await apply(ids, true);
    setSelected(new Set());
  };

  const error = dnaError || updatesError || uninstallError;

  const handleUninstall = (appId: string, name: string) => {
    const ok = window.confirm(
      `Uninstall "${name}"?\n\nRuns the publisher uninstall string (quiet if available), then scans leftovers. Continue?`,
    );
    if (!ok) return;
    void uninstall(appId);
  };

  const handleRemoveLeftovers = () => {
    if (!leftoverScan || leftoverScan.leftovers.length === 0) return;
    const paths = leftoverScan.leftovers.map((l) => l.path);
    const ok = window.confirm(
      `Remove ${paths.length} leftover path(s) (~${formatBytes(leftoverScan.totalLeftoverBytes)})?\n\nOnly Program Files / AppData matches are allowed. Continue?`,
    );
    if (!ok) return;
    void removeLeftovers(paths);
  };

  return (
    <PageShell
      title="Software"
      description="Updates, inventory, and uninstall with leftover cleanup."
      actions={
        <>
          <SegmentedControl
            ariaLabel="Software view"
            value={tab}
            onChange={setTab}
            options={
              [
                { id: 'updates', label: 'Updates' },
                { id: 'inventory', label: 'Inventory' },
                { id: 'uninstall', label: 'Uninstall' },
              ] as const
            }
          />
          {tab === 'inventory' ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                loading={loadingSnapshots || loadingInventory}
                onClick={() => void loadSnapshots()}
              >
                <RefreshCcw
                  className="h-4 w-4"
                  strokeWidth={1.75}
                  aria-hidden
                />
                Refresh
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={capturing}
                onClick={() => void capture()}
              >
                Capture baseline
              </Button>
            </>
          ) : tab === 'uninstall' ? (
            <Button
              variant="primary"
              size="sm"
              loading={appsLoading}
              onClick={() => void loadApps()}
            >
              Refresh apps
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                loading={updatesLoading}
                onClick={() => void loadUpdates()}
              >
                <RefreshCcw
                  className="h-4 w-4"
                  strokeWidth={1.75}
                  aria-hidden
                />
                Reload
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={updatesLoading}
                onClick={() => void scanUpdates()}
              >
                Scan updates
              </Button>
            </>
          )}
        </>
      }
    >
      {error ? (
        <AlertBanner title="Software unavailable" message={error} />
      ) : null}
      {uninstallMessage && !uninstallError ? (
        <AlertBanner title={uninstallMessage} tone="info" />
      ) : null}

      {lastResult ? (
        <AlertBanner
          tone="info"
          title={`Applied: ${lastResult.succeeded.length} · Failed: ${lastResult.failed.length} · Skipped: ${lastResult.skipped.length}`}
          message={
            lastResult.failed[0]
              ? `${lastResult.failed[0].name}: ${lastResult.failed[0].message}`
              : undefined
          }
        />
      ) : null}

      {tab === 'inventory' ? (
        loadingSnapshots && snapshots.length === 0 ? (
          <div className="flex justify-center py-16">
            <Spinner label="Loading software…" />
          </div>
        ) : !snapshot ? (
          <EmptyState
            icon={<Package className="h-8 w-8" strokeWidth={1.75} />}
            heading="No baseline yet"
            body="Capture a device baseline to inventory installed software."
            action={
              <Button
                variant="primary"
                size="sm"
                loading={capturing}
                onClick={() => void capture()}
              >
                Capture baseline
              </Button>
            }
          />
        ) : (
          <>
            <StatRow columns={4}>
              <StatTile label="Installed" value={snapshot.softwareCount} />
              <StatTile label="Version known" value={withVersion} />
              <StatTile
                label="Version unknown"
                value={inventory.length - withVersion}
              />
              <StatTile
                label="Baseline"
                value={formatTimestamp(snapshot.capturedAt)}
              />
            </StatRow>
            <section className="panel">
              <div className="panel-header">
                <p className="panel-title">Inventory</p>
                <p className="panel-subtitle">
                  From latest Device DNA baseline
                </p>
              </div>
              {loadingInventory ? (
                <div className="flex justify-center py-16">
                  <Spinner label="Loading inventory…" />
                </div>
              ) : (
                <div className="py-2">
                  <SoftwareInventoryTable items={inventory} />
                </div>
              )}
            </section>
          </>
        )
      ) : tab === 'uninstall' ? (
        appsLoading && apps.length === 0 ? (
          <div className="flex justify-center py-16">
            <Spinner label="Loading uninstallable apps…" />
          </div>
        ) : apps.length === 0 ? (
          <EmptyState
            icon={<Package className="h-8 w-8" strokeWidth={1.75} />}
            heading="No uninstallable apps"
            body="Could not read the uninstall registry."
          />
        ) : (
          <>
            <StatRow columns={2}>
              <StatTile label="Uninstallable apps" value={apps.length} />
              <StatTile
                label="Leftovers in scan"
                value={leftoverScan?.leftovers.length ?? 0}
              />
            </StatRow>
            <div className="mb-3">
              <input
                type="search"
                className="field max-w-md"
                placeholder="Filter apps…"
                value={appQuery}
                onChange={(e) => setAppQuery(e.target.value)}
                aria-label="Filter apps"
              />
            </div>
            {leftoverScan && leftoverScan.leftovers.length > 0 ? (
              <section className="panel mb-4">
                <div className="panel-header flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="panel-title">
                      Leftovers · {leftoverScan.app.name}
                    </p>
                    <p className="panel-subtitle">
                      {formatBytes(leftoverScan.totalLeftoverBytes)} across{' '}
                      {leftoverScan.leftovers.length} path(s)
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={uninstallActing}
                    onClick={handleRemoveLeftovers}
                  >
                    Remove leftovers
                  </Button>
                </div>
                <ul className="max-h-40 overflow-auto px-4 pb-3 font-mono text-2xs text-text-muted">
                  {leftoverScan.leftovers.map((l) => (
                    <li key={l.path} title={l.path}>
                      [{l.kind}] {l.path} · {formatBytes(l.sizeBytes)}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section className="panel">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Publisher</th>
                      <th>Version</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageApps.map((app) => (
                      <tr key={app.id}>
                        <td className="font-medium text-text-primary">
                          <span
                            className="block max-w-[220px] truncate"
                            title={app.name}
                          >
                            {app.name}
                          </span>
                        </td>
                        <td className="text-xs">{app.publisher ?? '—'}</td>
                        <td className="font-mono text-xs">
                          {app.version ?? '—'}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={uninstallActing}
                              onClick={() => void scanLeftovers(app.id)}
                            >
                              Leftovers
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              loading={uninstallActing}
                              onClick={() => handleUninstall(app.id, app.name)}
                            >
                              Uninstall
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination pagination={appPages} itemLabel="apps" />
            </section>
          </>
        )
      ) : updatesLoading && updates.length === 0 ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading updates…" />
        </div>
      ) : available.length === 0 && updates.length === 0 ? (
        <EmptyState
          icon={<Package className="h-8 w-8" strokeWidth={1.75} />}
          heading="No update scan yet"
          body="Scan for third-party upgrades via winget (live) or the lab catalog."
          action={
            <Button
              variant="primary"
              size="sm"
              loading={updatesLoading}
              onClick={() => void scanUpdates()}
            >
              Scan updates
            </Button>
          }
        />
      ) : available.length === 0 ? (
        <EmptyState
          heading="All clear"
          body="No available upgrades in the catalog. Scan again after installing new software."
          action={
            <Button
              variant="secondary"
              size="sm"
              loading={updatesLoading}
              onClick={() => void scanUpdates()}
            >
              Scan again
            </Button>
          }
        />
      ) : (
        <>
          <StatRow columns={3}>
            <StatTile label="Available" value={available.length} />
            <StatTile label="Selected" value={selected.size} />
            <StatTile
              label="Installed (catalog)"
              value={updates.filter((u) => u.status === 'installed').length}
            />
          </StatRow>

          <section className="panel">
            <div className="panel-header flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="panel-title">Available updates</p>
                <p className="panel-subtitle">
                  Bulk third-party upgrades · winget when available
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={toggleAllPage}>
                  Toggle page
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={applying}
                  disabled={selected.size === 0}
                  onClick={() => void handleApply()}
                >
                  Apply selected ({selected.size})
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-10" />
                    <th>Name</th>
                    <th>Current</th>
                    <th>Available</th>
                    <th>Id</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((u) => (
                    <UpdateRow
                      key={u.id}
                      update={u}
                      checked={selected.has(u.id)}
                      onToggle={() => toggle(u.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={pagination} itemLabel="updates" />
          </section>
        </>
      )}
    </PageShell>
  );
}

function UpdateRow({
  update,
  checked,
  onToggle,
}: {
  update: SoftwareUpdate;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <tr>
      <td>
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`Select ${update.name}`}
          className="h-3.5 w-3.5 rounded border-hairline"
        />
      </td>
      <td className="font-medium text-text-primary">
        <span className="block max-w-[220px] truncate" title={update.name}>
          {update.name}
        </span>
        {update.publisher ? (
          <span className="block text-2xs text-text-muted">
            {update.publisher}
          </span>
        ) : null}
      </td>
      <td className="font-mono text-xs">{update.currentVersion ?? '—'}</td>
      <td className="font-mono text-xs text-status-info">
        {update.availableVersion}
      </td>
      <td className="max-w-[160px] truncate font-mono text-xs text-text-muted">
        {update.wingetId ?? '—'}
      </td>
      <td>
        <StatusPill
          tone={
            update.status === 'installed'
              ? 'success'
              : update.status === 'failed'
                ? 'error'
                : 'neutral'
          }
        >
          {update.status}
        </StatusPill>
      </td>
    </tr>
  );
}
