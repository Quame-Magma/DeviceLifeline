import { useEffect, useMemo, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { useProcess } from '../hooks/use-process';
import { usePaginatedItems } from '../hooks/use-pagination';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Pagination } from '../components/common/Pagination';
import { SegmentedControl } from '../components/common/SegmentedControl';
import { Spinner } from '../components/common/Spinner';
import { StatRow, StatTile } from '../components/common/StatTile';
import { StatusPill } from '../components/common/StatusPill';
import { confirmAction } from '../lib/feedback';
import { formatBytes, formatPercent } from '../lib/format';
import type {
  MemoryRegion,
  ProcessDeepDetail,
  ProcessHandle,
  ProcessInfo,
  ProcessModule,
  ProcessTreeNode,
  ServiceInfo,
  WaitChainNode,
} from '../types/device.types';
import { PageShell } from '../components/layout/PageShell';

type ViewMode = 'list' | 'tree' | 'services';

function riskTone(score: number): 'error' | 'warning' | 'neutral' {
  if (score >= 70) {
    return 'error';
  }
  if (score >= 40) {
    return 'warning';
  }
  return 'neutral';
}

function riskLabel(score: number): string {
  if (score >= 70) {
    return 'High';
  }
  if (score >= 40) {
    return 'Elevated';
  }
  return 'Low';
}

function parentLabel(proc: ProcessInfo): string {
  if (proc.parentName) {
    return proc.parentName;
  }
  if (proc.parentPid !== null && proc.parentPid !== undefined) {
    return String(proc.parentPid);
  }
  return '-';
}

function childrenLabel(proc: ProcessInfo): string {
  if (typeof proc.childrenCount === 'number') {
    return String(proc.childrenCount);
  }
  return '-';
}

function optionalCount(value: number | null | undefined): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '-';
}

function serviceStatusTone(status: string): 'success' | 'neutral' | 'warning' {
  const normalized = status.toLowerCase();
  if (normalized.includes('run')) {
    return 'success';
  }
  if (normalized.includes('stop') || normalized.includes('pause')) {
    return 'neutral';
  }
  return 'warning';
}

/**
 * Process Explorer - list, tree, and services views with detail and end actions.
 */
export function ProcessExplorer() {
  const {
    processes,
    tree,
    services,
    selected,
    deep,
    loading,
    loadingDeep,
    killing,
    error,
    refresh,
    loadTree,
    loadServices,
    selectProcess,
    loadDetail,
    loadDeep,
    kill,
  } = useProcess();
  const [filter, setFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  useEffect(() => {
    void refresh();
    void loadTree();
    void loadServices();
  }, [loadServices, loadTree, refresh]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) {
      return processes;
    }
    return processes.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        String(p.pid).includes(q) ||
        (p.path ?? '').toLowerCase().includes(q) ||
        (p.cmd ?? '').toLowerCase().includes(q) ||
        (p.user ?? '').toLowerCase().includes(q) ||
        parentLabel(p).toLowerCase().includes(q) ||
        p.riskReasons.some((r) => r.toLowerCase().includes(q)),
    );
  }, [filter, processes]);

  const filteredServices = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) {
      return services;
    }
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.displayName.toLowerCase().includes(q) ||
        s.status.toLowerCase().includes(q) ||
        (s.startType ?? '').toLowerCase().includes(q) ||
        (s.path ?? '').toLowerCase().includes(q) ||
        (s.account ?? '').toLowerCase().includes(q) ||
        (s.pid !== null && s.pid !== undefined && String(s.pid).includes(q)),
    );
  }, [filter, services]);

  const elevatedCount = processes.filter((p) => p.riskScore >= 40).length;
  const runningServices = services.filter((s) =>
    s.status.toLowerCase().includes('run'),
  ).length;

  const handleRefresh = () => {
    void refresh();
    void loadTree();
    if (viewMode === 'services') {
      void loadServices();
    }
  };

  const handleSelect = (proc: ProcessInfo) => {
    selectProcess(proc);
    void loadDetail(proc.pid);
  };

  const handleLoadDeep = () => {
    if (!selected) {
      return;
    }
    void loadDeep(selected.pid);
  };

  const handleEndProcess = async () => {
    if (!selected) {
      return;
    }
    const confirmed = await confirmAction({
      title: `End process “${selected.name}”?`,
      description: `PID ${selected.pid}. Protected system processes may fail or be refused by the OS.`,
      confirmLabel: 'End process',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    void kill(selected.pid, false);
  };

  const handleEndProcessTree = async () => {
    if (!selected) {
      return;
    }
    const confirmed = await confirmAction({
      title: `End process tree for “${selected.name}”?`,
      description: `PID ${selected.pid}. This ends the process and its descendants. Protected system processes may fail or be refused by the OS.`,
      confirmLabel: 'End tree',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    void kill(selected.pid, true);
  };

  const showingCount =
    viewMode === 'list'
      ? filtered.length
      : viewMode === 'tree'
        ? tree.length
        : filteredServices.length;

  const processPages = usePaginatedItems(filtered);
  const servicePages = usePaginatedItems(filteredServices);

  return (
    <PageShell
      title="Processes"
      description="Running processes, trees, and Windows services."
      actions={
        <>
          <SegmentedControl
            ariaLabel="Process view mode"
            value={viewMode}
            onChange={(id) => {
              setViewMode(id);
              if (id === 'services') {
                void loadServices();
              }
            }}
            options={
              [
                { id: 'list', label: 'List' },
                { id: 'tree', label: 'Tree' },
                { id: 'services', label: 'Services' },
              ] as const
            }
          />
          <Button
            variant="primary"
            size="sm"
            loading={loading}
            onClick={handleRefresh}
          >
            {!loading && (
              <RefreshCcw
                aria-hidden="true"
                className="h-4 w-4"
                strokeWidth={1.75}
              />
            )}
            Refresh
          </Button>
        </>
      }
    >
      {error ? (
        <AlertBanner title="Could not load process data" message={error} />
      ) : null}

      <StatRow columns={4}>
        <StatTile label="Processes" value={processes.length} />
        <StatTile label="Elevated risk" value={elevatedCount} />
        <StatTile
          label="Services"
          value={`${runningServices}/${services.length}`}
        />
        <StatTile label="Showing" value={showingCount} />
      </StatRow>

      <div className="grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-[1fr_320px]">
        <div className="panel flex min-h-0 flex-col">
          <div className="panel-header">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="panel-title">
                  {viewMode === 'services'
                    ? 'Services'
                    : viewMode === 'tree'
                      ? 'Process tree'
                      : 'Process list'}
                </p>
                <p className="panel-subtitle">
                  {viewMode === 'services'
                    ? 'Windows services and start types'
                    : 'Select a row for detail and end actions'}
                </p>
              </div>
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={
                  viewMode === 'services'
                    ? 'Filter services…'
                    : 'Filter processes…'
                }
                aria-label={
                  viewMode === 'services'
                    ? 'Filter services'
                    : 'Filter processes'
                }
                className="field max-w-xs"
              />
            </div>
          </div>

          {loading &&
          processes.length === 0 &&
          tree.length === 0 &&
          services.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Spinner label="Loading process data..." />
            </div>
          ) : viewMode === 'list' ? (
            processes.length === 0 ? (
              <EmptyState
                heading="No process data"
                body="Refresh to sample running processes. Backend support is required for live listing."
                action={
                  <Button variant="secondary" size="sm" onClick={handleRefresh}>
                    Try again
                  </Button>
                }
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                heading="No matches"
                body={`No processes match "${filter}".`}
              />
            ) : (
              <div className="overflow-auto scrollbar-thin">
                <table className="data-table">
                  <thead className="sticky top-0 z-10 bg-surface-card">
                    <tr>
                      <th>Name</th>
                      <th className="text-right">PID</th>
                      <th>Parent</th>
                      <th className="text-right">CPU</th>
                      <th className="text-right">Memory</th>
                      <th className="text-right">Threads</th>
                      <th className="text-right">Handles</th>
                      <th>Risk</th>
                      <th className="text-right">Children</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processPages.pageItems.map((proc) => (
                      <ProcessRow
                        key={`${proc.pid}-${proc.name}`}
                        process={proc}
                        selected={selected?.pid === proc.pid}
                        onSelect={() => handleSelect(proc)}
                      />
                    ))}
                  </tbody>
                </table>
                <Pagination
                  pagination={processPages.pagination}
                  itemLabel="processes"
                />
              </div>
            )
          ) : viewMode === 'tree' ? (
            tree.length === 0 ? (
              <EmptyState
                heading="No process tree"
                body="Refresh to build the parent-child process forest."
                action={
                  <Button variant="secondary" size="sm" onClick={handleRefresh}>
                    Try again
                  </Button>
                }
              />
            ) : (
              <div className="overflow-auto p-2 scrollbar-thin">
                <ul className="space-y-0.5">
                  {tree.map((node) => (
                    <TreeNodeRow
                      key={`tree-${node.process.pid}-${node.process.name}`}
                      node={node}
                      depth={0}
                      filter={filter}
                      selectedPid={selected?.pid ?? null}
                      onSelect={handleSelect}
                    />
                  ))}
                </ul>
              </div>
            )
          ) : services.length === 0 ? (
            <EmptyState
              heading="No services"
              body="Refresh to inventory Windows services. Backend support is required."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void loadServices()}
                >
                  Try again
                </Button>
              }
            />
          ) : filteredServices.length === 0 ? (
            <EmptyState
              heading="No matches"
              body={`No services match "${filter}".`}
            />
          ) : (
            <div className="overflow-auto scrollbar-thin">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-surface-card">
                  <tr className="border-b border-surface-border">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Name
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Display
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Status
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Start
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      PID
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {servicePages.pageItems.map((svc) => (
                    <ServiceRow key={svc.name} service={svc} />
                  ))}
                </tbody>
              </table>
              <Pagination
                pagination={servicePages.pagination}
                itemLabel="services"
              />
            </div>
          )}
        </div>

        <div className="panel h-fit">
          <div className="panel-header">
            <p className="panel-title">Process detail</p>
            <p className="panel-subtitle">
              {selected
                ? `${selected.name} · PID ${selected.pid}`
                : 'Select a row to inspect'}
            </p>
          </div>
          {!selected ? (
            <p className="p-4 text-sm text-text-secondary">
              Select a process to inspect path, command line, user, modules, and
              risk reasons.
            </p>
          ) : (
            <div className="panel-body space-y-3">
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  {selected.name}
                </p>
                <p className="text-2xs text-text-muted">
                  PID {selected.pid}
                  {selected.status ? ` · ${selected.status}` : ''}
                </p>
              </div>
              <DetailField label="Path" value={selected.path ?? '-'} mono />
              <DetailField label="Command" value={selected.cmd ?? '-'} mono />
              <DetailField label="User" value={selected.user ?? '-'} />
              <DetailField label="Parent" value={parentLabel(selected)} />
              <div className="grid grid-cols-2 gap-3">
                <DetailField
                  label="Threads"
                  value={optionalCount(selected.threadCount)}
                />
                <DetailField
                  label="Handles"
                  value={optionalCount(selected.handleCount)}
                />
                <DetailField
                  label="Working set"
                  value={
                    typeof selected.workingSetBytes === 'number'
                      ? formatBytes(selected.workingSetBytes)
                      : formatBytes(selected.memoryBytes)
                  }
                />
                <DetailField label="Children" value={childrenLabel(selected)} />
              </div>
              <div>
                <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
                  Risk
                </p>
                <div className="mt-1">
                  <StatusPill tone={riskTone(selected.riskScore)}>
                    {`${riskLabel(selected.riskScore)} (${selected.riskScore})`}
                  </StatusPill>
                </div>
                {selected.riskReasons.length > 0 ? (
                  <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-text-secondary">
                    {selected.riskReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-text-muted">
                    No risk reasons recorded.
                  </p>
                )}
              </div>
              <ModulesTable modules={selected.modules ?? []} />
              <div className="flex flex-col gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={loadingDeep}
                  onClick={handleLoadDeep}
                  className="w-full"
                >
                  Load deep detail
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={killing}
                  onClick={handleEndProcess}
                  className="w-full"
                >
                  End process
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={killing}
                  onClick={handleEndProcessTree}
                  className="w-full"
                >
                  End process tree
                </Button>
              </div>
              <p className="text-2xs text-text-muted">
                Full deep results may require running elevated. Protected or
                system processes may fail to end. Tree kill ends descendants as
                well.
              </p>
              {deep && deep.process.pid === selected.pid && (
                <DeepDetailSections deep={deep} />
              )}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function ModulesTable({ modules }: { modules: ProcessModule[] }) {
  return (
    <div>
      <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
        Modules
      </p>
      {modules.length === 0 ? (
        <p className="mt-1 text-xs text-text-muted">
          No modules loaded for this process (or not available yet).
        </p>
      ) : (
        <div className="mt-2 max-h-48 overflow-auto rounded border border-surface-border scrollbar-thin">
          <table className="w-full border-collapse text-2xs">
            <thead className="sticky top-0 bg-surface-card">
              <tr className="border-b border-surface-border">
                <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-text-secondary">
                  Name
                </th>
                <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-text-secondary">
                  Path
                </th>
                <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wide text-text-secondary">
                  Size
                </th>
              </tr>
            </thead>
            <tbody>
              {modules.map((mod, index) => (
                <tr
                  key={`${mod.name}-${mod.baseAddress ?? index}`}
                  className="border-b border-surface-border last:border-b-0"
                >
                  <td
                    className="max-w-[100px] truncate px-2 py-1.5 font-medium text-text-primary"
                    title={mod.name}
                  >
                    {mod.name}
                  </td>
                  <td
                    className="max-w-[120px] truncate px-2 py-1.5 font-mono text-text-secondary"
                    title={mod.path ?? undefined}
                  >
                    {mod.path ?? '-'}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-text-secondary">
                    {typeof mod.sizeBytes === 'number'
                      ? formatBytes(mod.sizeBytes)
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const DEEP_MEMORY_LIMIT = 50;

function DeepDetailSections({ deep }: { deep: ProcessDeepDetail }) {
  const memoryShown = deep.memoryRegions.slice(0, DEEP_MEMORY_LIMIT);
  const memoryTotal = deep.memoryRegions.length;
  const namedHandles = deep.handles.filter(
    (h) => h.name !== null && h.name !== undefined && h.name.trim().length > 0,
  );
  const token = deep.token;

  return (
    <div className="space-y-3 border-t border-surface-border pt-3">
      <div className="rounded border border-status-warning/30 bg-status-warning-bg px-3 py-2 text-2xs text-status-warning">
        Full results may require running elevated. Partial data is shown when
        access is limited.
      </div>

      {deep.notes.length > 0 && (
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
            Notes
          </p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-text-secondary">
            {deep.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
          Token
        </p>
        {!token ? (
          <p className="mt-1 text-xs text-text-muted">
            Token information not available
            {deep.elevated ? '' : ' (process not elevated)'}.
          </p>
        ) : (
          <div className="mt-1 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <DetailField
                label="Elevated"
                value={token.elevated || deep.elevated ? 'Yes' : 'No'}
              />
              <DetailField label="Integrity" value={token.integrity ?? '-'} />
            </div>
            {token.user && (
              <DetailField label="Token user" value={token.user} />
            )}
            {token.privileges.length === 0 ? (
              <p className="text-xs text-text-muted">No privileges returned.</p>
            ) : (
              <div className="max-h-40 overflow-auto rounded border border-surface-border scrollbar-thin">
                <table className="w-full border-collapse text-2xs">
                  <thead className="sticky top-0 bg-surface-card">
                    <tr className="border-b border-surface-border">
                      <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-text-secondary">
                        Privilege
                      </th>
                      <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-text-secondary">
                        Enabled
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {token.privileges.map((priv) => (
                      <tr
                        key={priv.name}
                        className="border-b border-surface-border last:border-b-0"
                      >
                        <td
                          className="max-w-[160px] truncate px-2 py-1.5 font-mono text-text-primary"
                          title={priv.description ?? priv.name}
                        >
                          {priv.name}
                        </td>
                        <td className="px-2 py-1.5 text-text-secondary">
                          {priv.enabled ? 'Yes' : 'No'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <DeepMemoryTable regions={memoryShown} total={memoryTotal} />
      <DeepWaitChainTable nodes={deep.waitChains} />
      <DeepHandlesTable handles={namedHandles} total={deep.handles.length} />
    </div>
  );
}

function DeepMemoryTable({
  regions,
  total,
}: {
  regions: MemoryRegion[];
  total: number;
}) {
  return (
    <div>
      <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
        Memory regions
      </p>
      <p className="mt-0.5 text-2xs text-text-muted">
        Showing {regions.length}
        {total > regions.length ? ` of ${total}` : ''}
      </p>
      {regions.length === 0 ? (
        <p className="mt-1 text-xs text-text-muted">
          No memory regions returned.
        </p>
      ) : (
        <div className="mt-2 max-h-48 overflow-auto rounded border border-surface-border scrollbar-thin">
          <table className="w-full border-collapse text-2xs">
            <thead className="sticky top-0 bg-surface-card">
              <tr className="border-b border-surface-border">
                <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-text-secondary">
                  Base
                </th>
                <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wide text-text-secondary">
                  Size
                </th>
                <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-text-secondary">
                  State
                </th>
                <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-text-secondary">
                  Protect
                </th>
                <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-text-secondary">
                  Type
                </th>
              </tr>
            </thead>
            <tbody>
              {regions.map((region) => (
                <tr
                  key={`${region.baseAddress}-${region.sizeBytes}`}
                  className="border-b border-surface-border last:border-b-0"
                >
                  <td
                    className="max-w-[90px] truncate px-2 py-1.5 font-mono text-text-primary"
                    title={region.baseAddress}
                  >
                    {region.baseAddress}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-text-secondary">
                    {formatBytes(region.sizeBytes)}
                  </td>
                  <td className="px-2 py-1.5 text-text-secondary">
                    {region.state}
                  </td>
                  <td
                    className="max-w-[80px] truncate px-2 py-1.5 text-text-secondary"
                    title={region.protect}
                  >
                    {region.protect}
                  </td>
                  <td className="px-2 py-1.5 text-text-secondary">
                    {region.regionType}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DeepWaitChainTable({ nodes }: { nodes: WaitChainNode[] }) {
  return (
    <div>
      <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
        Wait chains / threads
      </p>
      {nodes.length === 0 ? (
        <p className="mt-1 text-xs text-text-muted">
          No wait chain data returned.
        </p>
      ) : (
        <div className="mt-2 max-h-40 overflow-auto rounded border border-surface-border scrollbar-thin">
          <table className="w-full border-collapse text-2xs">
            <thead className="sticky top-0 bg-surface-card">
              <tr className="border-b border-surface-border">
                <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wide text-text-secondary">
                  Thread
                </th>
                <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-text-secondary">
                  Status
                </th>
                <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-text-secondary">
                  Wait
                </th>
                <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-text-secondary">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => (
                <tr
                  key={`${node.threadId}-${node.status}`}
                  className="border-b border-surface-border last:border-b-0"
                >
                  <td className="px-2 py-1.5 text-right tabular-nums text-text-primary">
                    {node.threadId}
                  </td>
                  <td className="px-2 py-1.5 text-text-secondary">
                    {node.status}
                  </td>
                  <td className="px-2 py-1.5 text-text-secondary">
                    {node.waitReason ?? '-'}
                  </td>
                  <td
                    className="max-w-[120px] truncate px-2 py-1.5 text-text-secondary"
                    title={node.detail ?? undefined}
                  >
                    {node.detail ?? '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DeepHandlesTable({
  handles,
  total,
}: {
  handles: ProcessHandle[];
  total: number;
}) {
  return (
    <div>
      <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
        Named handles
      </p>
      <p className="mt-0.5 text-2xs text-text-muted">
        {handles.length} named
        {total > handles.length ? ` of ${total} total` : ''}
      </p>
      {handles.length === 0 ? (
        <p className="mt-1 text-xs text-text-muted">
          No named handles returned.
        </p>
      ) : (
        <div className="mt-2 max-h-40 overflow-auto rounded border border-surface-border scrollbar-thin">
          <table className="w-full border-collapse text-2xs">
            <thead className="sticky top-0 bg-surface-card">
              <tr className="border-b border-surface-border">
                <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-text-secondary">
                  Type
                </th>
                <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-text-secondary">
                  Name
                </th>
                <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-text-secondary">
                  Access
                </th>
              </tr>
            </thead>
            <tbody>
              {handles.map((handle) => (
                <tr
                  key={`${handle.handle}-${handle.handleType}-${handle.name ?? ''}`}
                  className="border-b border-surface-border last:border-b-0"
                >
                  <td className="px-2 py-1.5 text-text-secondary">
                    {handle.handleType}
                  </td>
                  <td
                    className="max-w-[140px] truncate px-2 py-1.5 font-mono text-text-primary"
                    title={handle.name ?? undefined}
                  >
                    {handle.name ?? '-'}
                  </td>
                  <td
                    className="max-w-[80px] truncate px-2 py-1.5 text-text-secondary"
                    title={handle.access ?? undefined}
                  >
                    {handle.access ?? '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DetailField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p
        className={[
          'mt-0.5 break-all text-sm text-text-primary',
          mono ? 'font-mono text-xs' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function ProcessRow({
  process: proc,
  selected,
  onSelect,
}: {
  process: ProcessInfo;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <tr
      className={[
        'cursor-pointer border-b border-surface-border last:border-b-0',
        selected ? 'bg-surface-card' : 'hover:bg-surface-elevated',
      ].join(' ')}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      aria-selected={selected}
    >
      <td className="px-4 py-2.5 font-medium text-text-primary">{proc.name}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
        {proc.pid}
      </td>
      <td
        className="max-w-[140px] truncate px-4 py-2.5 text-text-secondary"
        title={parentLabel(proc)}
      >
        {parentLabel(proc)}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
        {formatPercent(proc.cpuUsage)}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
        {formatBytes(proc.memoryBytes)}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
        {optionalCount(proc.threadCount)}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
        {optionalCount(proc.handleCount)}
      </td>
      <td
        className="px-4 py-2.5"
        title={proc.riskReasons.join('; ') || undefined}
      >
        <StatusPill tone={riskTone(proc.riskScore)}>
          {`${riskLabel(proc.riskScore)} (${proc.riskScore})`}
        </StatusPill>
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
        {childrenLabel(proc)}
      </td>
    </tr>
  );
}

function ServiceRow({ service: svc }: { service: ServiceInfo }) {
  return (
    <tr className="border-b border-surface-border last:border-b-0 hover:bg-surface/80">
      <td
        className="max-w-[160px] truncate px-4 py-2.5 font-medium text-text-primary"
        title={svc.name}
      >
        {svc.name}
      </td>
      <td
        className="max-w-[200px] truncate px-4 py-2.5 text-text-secondary"
        title={svc.displayName}
      >
        {svc.displayName}
      </td>
      <td className="px-4 py-2.5">
        <StatusPill tone={serviceStatusTone(svc.status)}>
          {svc.status}
        </StatusPill>
      </td>
      <td className="px-4 py-2.5 capitalize text-text-secondary">
        {svc.startType ?? '-'}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
        {svc.pid !== null && svc.pid !== undefined ? svc.pid : '-'}
      </td>
    </tr>
  );
}

function nodeMatchesFilter(node: ProcessTreeNode, filter: string): boolean {
  const q = filter.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const proc = node.process;
  const selfMatch =
    proc.name.toLowerCase().includes(q) ||
    String(proc.pid).includes(q) ||
    (proc.path ?? '').toLowerCase().includes(q) ||
    parentLabel(proc).toLowerCase().includes(q);
  if (selfMatch) {
    return true;
  }
  return node.children.some((child) => nodeMatchesFilter(child, filter));
}

function TreeNodeRow({
  node,
  depth,
  filter,
  selectedPid,
  onSelect,
}: {
  node: ProcessTreeNode;
  depth: number;
  filter: string;
  selectedPid: number | null;
  onSelect: (proc: ProcessInfo) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const proc = node.process;
  const hasChildren = node.children.length > 0;
  const visible = nodeMatchesFilter(node, filter);

  if (!visible) {
    return null;
  }

  const selected = selectedPid === proc.pid;

  return (
    <li>
      <div
        className={[
          'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm',
          selected ? 'bg-surface-card' : 'hover:bg-surface-elevated',
        ].join(' ')}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onSelect(proc)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(proc);
          }
        }}
        tabIndex={0}
        role="treeitem"
        aria-selected={selected}
        aria-expanded={hasChildren ? expanded : undefined}
      >
        {hasChildren ? (
          <button
            type="button"
            className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-text-muted hover:bg-surface-border/60 hover:text-text-primary"
            aria-label={expanded ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
          >
            <span className="text-2xs font-semibold">
              {expanded ? '-' : '+'}
            </span>
          </button>
        ) : (
          <span className="inline-block h-5 w-5 flex-shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
          {proc.name}
        </span>
        <span className="flex-shrink-0 tabular-nums text-2xs text-text-muted">
          {proc.pid}
        </span>
        <span className="flex-shrink-0 tabular-nums text-2xs text-text-secondary">
          {formatPercent(proc.cpuUsage)}
        </span>
        <span className="flex-shrink-0 tabular-nums text-2xs text-text-secondary">
          {formatBytes(proc.memoryBytes)}
        </span>
        <StatusPill tone={riskTone(proc.riskScore)}>
          {String(proc.riskScore)}
        </StatusPill>
      </div>
      {hasChildren && expanded && (
        <ul>
          {node.children.map((child) => (
            <TreeNodeRow
              key={`tree-${child.process.pid}-${child.process.name}`}
              node={child}
              depth={depth + 1}
              filter={filter}
              selectedPid={selectedPid}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
