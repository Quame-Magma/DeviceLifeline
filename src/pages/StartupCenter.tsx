import { useEffect, useMemo, useState } from 'react';
import { Power } from 'lucide-react';
import { useStartup } from '../hooks/use-startup';
import { usePaginatedItems } from '../hooks/use-pagination';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Pagination } from '../components/common/Pagination';
import { SegmentedControl } from '../components/common/SegmentedControl';
import { Spinner } from '../components/common/Spinner';
import { StatRow, StatTile } from '../components/common/StatTile';
import { StatusPill } from '../components/common/StatusPill';
import type { StartupEntry } from '../types/device.types';
import { PageShell } from '../components/layout/PageShell';

type CategoryFilter =
  | 'all'
  | 'run_key'
  | 'startup_folder'
  | 'scheduled_task'
  | 'service'
  | 'driver'
  | 'winlogon'
  | 'image_hijack'
  | 'explorer'
  | 'wmi'
  | 'other';

function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    run_key: 'Logon (Run)',
    run_once: 'RunOnce',
    startup_folder: 'Startup folder',
    scheduled_task: 'Scheduled task',
    service: 'Service',
    driver: 'Driver',
    winlogon: 'Winlogon',
    appinit: 'AppInit',
    image_hijack: 'Image hijack',
    boot_execute: 'Boot execute',
    knowndlls: 'KnownDLLs',
    lsa: 'LSA',
    winsock: 'Winsock',
    print_monitor: 'Print monitor',
    network_provider: 'Network provider',
    codec: 'Codec',
    internet_explorer: 'BHO / IE',
    explorer: 'Explorer',
    wmi: 'WMI',
  };
  return labels[cat] ?? cat;
}

function matchesFilter(cat: string, filter: CategoryFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'run_key') {
    return cat === 'run_key' || cat === 'run_once';
  }
  if (filter === 'other') {
    return ![
      'run_key',
      'run_once',
      'startup_folder',
      'scheduled_task',
      'service',
      'driver',
      'winlogon',
      'image_hijack',
      'explorer',
      'wmi',
    ].includes(cat);
  }
  return cat === filter;
}

/**
 * Autoruns-class startup intelligence: inventory + enable/disable with audit.
 */
export function StartupCenter() {
  const { entries, loading, acting, error, message, load, setEnabled } =
    useStartup();
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (!matchesFilter(e.category, filter)) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        (e.command ?? '').toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q)
      );
    });
  }, [entries, filter, query]);

  const enabledCount = entries.filter((e) => e.enabled).length;
  const { pageItems, pagination } = usePaginatedItems(filtered);

  const handleToggle = (entry: StartupEntry) => {
    const next = !entry.enabled;
    const ok = window.confirm(
      `${next ? 'Enable' : 'Disable'} "${entry.name}"?\n\n` +
        `Location: ${entry.location}\n` +
        `Scope: ${entry.scope}\n\n` +
        `This is audited. Machine-wide changes may require elevation.`,
    );
    if (!ok) return;
    void setEnabled(entry.id, next);
  };

  return (
    <PageShell
      title="Startup"
      description="Logon, tasks, services, drivers, and other persistence."
      actions={
        <Button
          variant="primary"
          size="sm"
          loading={loading}
          onClick={() => void load()}
        >
          Refresh
        </Button>
      }
    >
      {error ? (
        <AlertBanner title="Startup unavailable" message={error} />
      ) : null}
      {message && !error ? <AlertBanner title={message} tone="info" /> : null}

      <StatRow columns={3}>
        <StatTile label="Entries" value={entries.length} />
        <StatTile label="Enabled" value={enabledCount} />
        <StatTile label="Disabled" value={entries.length - enabledCount} />
      </StatRow>

      <section className="panel">
        <div className="panel-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="panel-title">Persistence map</p>
            <p className="panel-subtitle">
              Toggle with confirmation · audited · protected services blocked
            </p>
          </div>
          <input
            type="search"
            className="field max-w-xs"
            placeholder="Filter name or path…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter startup entries"
          />
        </div>

        <div className="px-panel-x pb-2">
          <SegmentedControl
            ariaLabel="Startup category"
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'all', label: 'All' },
              { id: 'run_key', label: 'Logon' },
              { id: 'startup_folder', label: 'Folder' },
              { id: 'scheduled_task', label: 'Tasks' },
              { id: 'service', label: 'Services' },
              { id: 'driver', label: 'Drivers' },
              { id: 'winlogon', label: 'Winlogon' },
              { id: 'image_hijack', label: 'IFEO' },
              { id: 'explorer', label: 'Explorer' },
              { id: 'wmi', label: 'WMI' },
              { id: 'other', label: 'Other' },
            ]}
          />
        </div>

        {loading && entries.length === 0 ? (
          <div className="flex justify-center py-16">
            <Spinner label="Loading startup entries…" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Power className="h-8 w-8" strokeWidth={1.75} />}
            heading="No startup entries"
            body="Refresh to scan Run keys, Startup folders, tasks, and third-party services."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Scope</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((entry) => (
                    <tr key={entry.id}>
                      <td className="font-medium text-text-primary">
                        <span
                          className="block max-w-[200px] truncate"
                          title={entry.command ?? entry.name}
                        >
                          {entry.name}
                        </span>
                      </td>
                      <td className="text-xs">
                        {categoryLabel(entry.category)}
                      </td>
                      <td className="text-xs capitalize">{entry.scope}</td>
                      <td>
                        <StatusPill
                          tone={entry.enabled ? 'success' : 'neutral'}
                        >
                          {entry.enabled ? 'Enabled' : 'Disabled'}
                        </StatusPill>
                      </td>
                      <td>
                        <span
                          className="block max-w-[220px] truncate font-mono text-2xs text-text-muted"
                          title={entry.location}
                        >
                          {entry.location}
                        </span>
                      </td>
                      <td>
                        {entry.canToggle ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={acting}
                            onClick={() => handleToggle(entry)}
                          >
                            {entry.enabled ? 'Disable' : 'Enable'}
                          </Button>
                        ) : (
                          <span className="text-2xs text-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={pagination} itemLabel="entries" />
          </>
        )}
      </section>
    </PageShell>
  );
}
