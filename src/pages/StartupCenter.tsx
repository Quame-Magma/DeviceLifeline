import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Code2,
  FileCode2,
  FolderOpen,
  Layers,
  Lightbulb,
  MoreHorizontal,
  Power,
  RefreshCw,
  Rocket,
  Search,
  Shield,
  Terminal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useStartup } from '../hooks/use-startup';
import {
  DEFAULT_PAGE_SIZE,
  usePaginatedItems,
} from '../hooks/use-pagination';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Pagination } from '../components/common/Pagination';
import { Spinner } from '../components/common/Spinner';
import type { StartupEntry } from '../types/device.types';
import { PageShell } from '../components/layout/PageShell';
import { confirmAction, toast, toastInfo } from '../lib/feedback';

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

type ImpactLevel = 'Low' | 'Medium' | 'High';

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
  return labels[cat] ?? cat.replace(/_/g, ' ');
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

/** Estimated startup impact (heuristic — not measured boot cost). */
function entryImpact(entry: StartupEntry): ImpactLevel {
  if (!entry.enabled) return 'Low';
  const c = entry.category;
  if (
    c === 'driver' ||
    c === 'service' ||
    c === 'image_hijack' ||
    c === 'winlogon' ||
    c === 'boot_execute' ||
    c === 'lsa' ||
    c === 'appinit'
  ) {
    return 'High';
  }
  if (
    c === 'run_key' ||
    c === 'run_once' ||
    c === 'scheduled_task' ||
    c === 'wmi' ||
    c === 'explorer'
  ) {
    return 'Medium';
  }
  return 'Low';
}

function overallImpact(entries: StartupEntry[]): ImpactLevel {
  const enabled = entries.filter((e) => e.enabled);
  if (enabled.length === 0) return 'Low';
  const high = enabled.filter((e) => entryImpact(e) === 'High').length;
  const med = enabled.filter((e) => entryImpact(e) === 'Medium').length;
  if (high >= 8 || high + med >= 40) return 'High';
  if (high >= 2 || med >= 10 || enabled.length >= 50) return 'Medium';
  return 'Low';
}

function impactTone(level: ImpactLevel): string {
  if (level === 'High') return 'text-status-error';
  if (level === 'Medium') return 'text-status-warning';
  return 'text-status-success';
}

function impactDot(level: ImpactLevel): string {
  if (level === 'High') return 'bg-status-error';
  if (level === 'Medium') return 'bg-status-warning';
  return 'bg-status-success';
}

function categoryIcon(cat: string): LucideIcon {
  switch (cat) {
    case 'boot_execute':
      return Terminal;
    case 'codec':
      return Code2;
    case 'service':
      return Layers;
    case 'driver':
      return Shield;
    case 'scheduled_task':
      return CircleDot;
    case 'startup_folder':
      return FolderOpen;
    case 'run_key':
    case 'run_once':
      return Rocket;
    default:
      return FileCode2;
  }
}

const FILTER_TABS: { id: CategoryFilter; label: string }[] = [
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
];

/**
 * Startup — redesigned to ChatGPT mock:
 * metric strip, persistence table with impact, right impact panel + quick actions.
 */
export function StartupCenter() {
  const { entries, loading, acting, error, message, load, setEnabled } =
    useStartup();
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    void load();
  }, [load]);

  const seenMessage = useRef<string | null>(null);
  useEffect(() => {
    if (!message || error) return;
    if (seenMessage.current === message) return;
    seenMessage.current = message;
    toastInfo(message);
  }, [message, error]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (!matchesFilter(e.category, filter)) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        (e.command ?? '').toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        categoryLabel(e.category).toLowerCase().includes(q)
      );
    });
  }, [entries, filter, query]);

  const enabledCount = useMemo(
    () => entries.filter((e) => e.enabled).length,
    [entries],
  );
  const disabledCount = entries.length - enabledCount;
  const impact = useMemo(() => overallImpact(entries), [entries]);

  const { pageItems, pagination } = usePaginatedItems(filtered);

  // Clear selection for ids no longer on the page set
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(filtered.map((e) => e.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  const allPageSelected =
    pageItems.length > 0 && pageItems.every((e) => selected.has(e.id));

  const toggleSelectAllPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const e of pageItems) next.delete(e.id);
      } else {
        for (const e of pageItems) next.add(e.id);
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggle = async (entry: StartupEntry) => {
    const next = !entry.enabled;
    const ok = await confirmAction({
      title: `${next ? 'Enable' : 'Disable'} “${entry.name}”?`,
      description:
        `Location: ${entry.location}\nScope: ${entry.scope}\n\n` +
        `This change is audited. Machine-wide changes may require elevation.`,
      confirmLabel: next ? 'Enable' : 'Disable',
      tone: next ? 'primary' : 'warning',
    });
    if (!ok) return;
    void setEnabled(entry.id, next);
  };

  const handleBulk = async (enable: boolean) => {
    const targets = entries.filter(
      (e) => e.canToggle && e.enabled !== enable,
    );
    if (targets.length === 0) {
      toastInfo(enable ? 'Nothing to enable.' : 'Nothing to disable.');
      return;
    }
    const ok = await confirmAction({
      title: enable ? 'Enable all toggleable entries?' : 'Disable all toggleable entries?',
      description: `${targets.length} entry(ies) will be ${enable ? 'enabled' : 'disabled'}. Protected items stay unchanged.`,
      confirmLabel: enable ? 'Enable all' : 'Disable all',
      tone: enable ? 'primary' : 'warning',
    });
    if (!ok) return;
    for (const e of targets.slice(0, 80)) {
      await setEnabled(e.id, enable);
    }
    toast({
      title: enable ? 'Enable requested' : 'Disable requested',
      description: `Processed up to ${Math.min(80, targets.length)} entries.`,
      tone: 'success',
    });
  };

  const openTaskScheduler = () => {
    // Best-effort: Windows Task Scheduler MMC
    void import('@tauri-apps/plugin-opener')
      .then((m) => m.openUrl('taskschd.msc'))
      .catch(() => {
        toastInfo('Open Task Scheduler from Windows Start if this fails.');
      });
  };

  const generateReport = () => {
    const lines = [
      `DeviceLifeline Startup Report`,
      `Entries: ${entries.length}`,
      `Enabled: ${enabledCount}`,
      `Disabled: ${disabledCount}`,
      `Impact: ${impact}`,
      '',
      ...filtered.slice(0, 200).map(
        (e) =>
          `${e.enabled ? 'ON ' : 'OFF'} | ${categoryLabel(e.category)} | ${e.scope} | ${e.name} | ${e.location}`,
      ),
    ];
    void navigator.clipboard.writeText(lines.join('\n')).then(
      () =>
        toast({
          title: 'Report copied',
          description: 'Startup summary copied to clipboard.',
          tone: 'success',
        }),
      () => toastInfo('Could not copy report to clipboard.'),
    );
  };

  return (
    <PageShell
      title="Startup"
      description="Logon, tasks, services, drivers, and other persistence."
      actions={
        <Button
          variant="secondary"
          size="sm"
          loading={loading}
          onClick={() => void load()}
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          Refresh
        </Button>
      }
    >
      {error ? (
        <AlertBanner title="Startup unavailable" message={error} />
      ) : null}

      {/* Metric strip */}
      <div
        className="grid grid-cols-2 gap-2 xl:grid-cols-4"

      >
        <MetricTile
          icon={Rocket}
          iconClass="text-accent bg-accent/15"
          label="Total entries"
          value={entries.length.toLocaleString()}
          hint="All startup items"
        />
        <MetricTile
          icon={CheckCircle2}
          iconClass="text-status-success bg-status-success-bg"
          label="Enabled"
          value={enabledCount.toLocaleString()}
          hint="Active items"
          valueClass="text-status-success"
        />
        <MetricTile
          icon={Ban}
          iconClass="text-status-error bg-status-error-bg"
          label="Disabled"
          value={disabledCount.toLocaleString()}
          hint="Disabled items"
        />
        <MetricTile
          icon={Layers}
          iconClass="text-status-warning bg-status-warning-bg"
          label="Impact summary"
          value={impact}
          hint="Estimated (not measured boot cost)"
          valueClass={impactTone(impact)}
        />
      </div>

      {/* Main + sidebar */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,280px)]">
        {/* Persistence map */}
        <section className="panel min-w-0">
          <div className="panel-header flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="panel-title">Persistence map</p>
              <p className="panel-subtitle">
                Manage items that run automatically on system startup.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <input
                  type="search"
                  className="field w-full pl-8"
                  placeholder="Filter name or path…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Filter startup entries"
                />
              </div>
            </div>
          </div>

          {/* Category tabs */}
          <div className="flex flex-wrap gap-1.5 border-b border-hairline px-panel-x py-2.5">
            {FILTER_TABS.map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={[
                    'rounded-control px-2.5 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'bg-status-success text-white shadow-sm'
                      : 'border border-hairline bg-surface-elevated/40 text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              );
            })}
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
                      <th className="w-10">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-hairline"
                          checked={allPageSelected}
                          onChange={toggleSelectAllPage}
                          aria-label="Select all on page"
                        />
                      </th>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Scope</th>
                      <th>Status</th>
                      <th>Location</th>
                      <th>Impact</th>
                      <th>Action</th>
                      <th className="w-8" aria-label="More" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((entry) => (
                      <StartupRow
                        key={entry.id}
                        entry={entry}
                        selected={selected.has(entry.id)}
                        acting={acting}
                        onSelect={() => toggleSelect(entry.id)}
                        onToggle={() => {
                          void handleToggle(entry);
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination pagination={pagination} itemLabel="entries" />
              <p className="border-t border-hairline px-panel-x py-2 text-2xs text-text-ash">
                Showing page {pagination.page} · {DEFAULT_PAGE_SIZE} per page ·{' '}
                {filtered.length.toLocaleString()} matching
              </p>
            </>
          )}
        </section>

        {/* Right rail */}
        <aside className="flex min-w-0 flex-col gap-3">
          <ImpactPanel impact={impact} />

          <section className="panel">
            <div className="panel-header">
              <p className="panel-title">Last boot time</p>
              <p className="panel-subtitle">Windows boot time</p>
            </div>
            <div className="panel-body">
              <p className="text-3xl font-semibold tabular-nums tracking-tight text-text-primary cause-semibold">
                —
              </p>
              <p className="mt-1 text-2xs text-text-muted">
                Boot duration is estimated from timeline when available.
              </p>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <p className="panel-title">Quick actions</p>
            </div>
            <div className="panel-body space-y-2">
              <QuickAction
                icon={CheckCircle2}
                iconClass="text-status-success"
                label="Enable all"
                onClick={() => {
                  void handleBulk(true);
                }}
              />
              <QuickAction
                icon={Ban}
                iconClass="text-status-error"
                label="Disable all"
                onClick={() => {
                  void handleBulk(false);
                }}
              />
              <QuickAction
                icon={Layers}
                iconClass="text-text-muted"
                label="Open Task Scheduler"
                onClick={openTaskScheduler}
              />
              <QuickAction
                icon={FileCode2}
                iconClass="text-text-muted"
                label="Generate report"
                onClick={generateReport}
              />
            </div>
          </section>

          <div className="rounded-card border border-hairline bg-surface-card px-panel-x py-3 shadow-card">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-text-secondary">
              <Lightbulb
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning"
                strokeWidth={1.75}
                aria-hidden
              />
              <span>
                <span className="font-semibold text-text-primary">Tip: </span>
                Disable unnecessary startup items to speed up boot time and
                improve performance.
              </span>
            </p>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}

function MetricTile({
  icon: Icon,
  iconClass,
  label,
  value,
  hint,
  valueClass = 'text-text-primary',
}: {
  icon: LucideIcon;
  iconClass: string;
  label: string;
  value: string;
  hint: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-hairline bg-surface-card px-panel-x py-panel-y shadow-card">
      <span
        className={[
          'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          iconClass,
        ].join(' ')}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
          {label}
        </p>
        <p
          className={[
            'mt-0.5 text-xl font-semibold tabular-nums tracking-tight cause-semibold',
            valueClass,
          ].join(' ')}
        >
          {value}
        </p>
        <p className="text-2xs text-text-muted">{hint}</p>
      </div>
    </div>
  );
}

function ImpactPanel({ impact }: { impact: ImpactLevel }) {
  // Semi-circle gauge 0–100 mapped from impact
  const score = impact === 'High' ? 78 : impact === 'Medium' ? 52 : 22;
  const r = 54;
  const c = Math.PI * r; // half circumference
  const offset = c * (1 - score / 100);
  const stroke =
    impact === 'High'
      ? '#ff6b6b'
      : impact === 'Medium'
        ? '#f5b942'
        : '#3dd68c';

  return (
    <section className="panel">
      <div className="panel-header">
        <p className="panel-title">Estimated impact</p>
      </div>
      <div className="panel-body flex flex-col items-center pb-5 pt-2">
        <svg
          viewBox="0 0 140 80"
          className="h-20 w-36"
          role="img"
          aria-label={`Startup impact ${impact}`}
        >
          <path
            d="M 16 70 A 54 54 0 0 1 124 70"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M 16 70 A 54 54 0 0 1 124 70"
            fill="none"
            stroke={stroke}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${c}`}
            strokeDashoffset={offset}
          />
        </svg>
        <p
          className={[
            '-mt-6 text-lg font-semibold',
            impactTone(impact),
          ].join(' ')}
        >
          {impact}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-2xs text-text-muted">
          Estimated (not measured boot)
          <span
            className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-hairline text-[9px] text-text-ash"
            title="Heuristic based on enabled high-impact persistence categories — not measured boot time"
          >
            i
          </span>
        </p>
      </div>
    </section>
  );
}

function QuickAction({
  icon: Icon,
  iconClass,
  label,
  badge,
  onClick,
}: {
  icon: LucideIcon;
  iconClass: string;
  label: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-control border border-hairline bg-surface-elevated/30 px-3 py-2.5 text-left text-sm text-text-primary transition-colors hover:bg-surface-elevated"
    >
      <Icon
        className={['h-4 w-4 shrink-0', iconClass].join(' ')}
        strokeWidth={1.75}
        aria-hidden
      />
      <span className="min-w-0 flex-1 font-medium">{label}</span>
      {badge ? (
        <span className="rounded bg-accent/20 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-accent">
          {badge}
        </span>
      ) : (
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 text-text-ash"
          strokeWidth={1.75}
          aria-hidden
        />
      )}
    </button>
  );
}

function StartupRow({
  entry,
  selected,
  acting,
  onSelect,
  onToggle,
}: {
  entry: StartupEntry;
  selected: boolean;
  acting: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const impact = entryImpact(entry);
  const Icon = categoryIcon(entry.category);
  const subtitle =
    entry.command?.trim() ||
    categoryLabel(entry.category);

  return (
    <tr className={selected ? 'bg-surface-elevated/40' : undefined}>
      <td className="align-middle">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-hairline"
          checked={selected}
          onChange={onSelect}
          aria-label={`Select ${entry.name}`}
        />
      </td>
      <td className="align-middle">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-elevated text-text-muted">
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <p
              className="truncate text-sm font-medium text-text-primary"
              title={entry.name}
            >
              {entry.name}
            </p>
            <p
              className="truncate text-2xs text-text-muted"
              title={subtitle}
            >
              {subtitle.length > 48 ? `${subtitle.slice(0, 48)}…` : subtitle}
            </p>
          </div>
        </div>
      </td>
      <td className="align-middle text-xs text-text-secondary">
        {categoryLabel(entry.category)}
      </td>
      <td className="align-middle text-xs capitalize text-text-secondary">
        {entry.scope}
      </td>
      <td className="align-middle">
        <span
          className={[
            'inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-semibold',
            entry.enabled
              ? 'border-status-success/40 bg-status-success-bg text-status-success'
              : 'border-hairline bg-surface-elevated text-text-muted',
          ].join(' ')}
        >
          {entry.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </td>
      <td className="align-middle">
        <span
          className="block max-w-[200px] truncate font-mono text-2xs text-text-muted"
          title={entry.location}
        >
          {entry.location}
        </span>
      </td>
      <td className="align-middle">
        <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
          <span
            className={['h-1.5 w-1.5 rounded-full', impactDot(impact)].join(
              ' ',
            )}
            aria-hidden
          />
          <span className={impactTone(impact)}>{impact}</span>
        </span>
      </td>
      <td className="align-middle">
        {entry.canToggle ? (
          <Button
            variant="secondary"
            size="sm"
            loading={acting}
            onClick={onToggle}
          >
            {entry.enabled ? 'Disable' : 'Enable'}
          </Button>
        ) : (
          <span className="text-2xs text-text-muted">—</span>
        )}
      </td>
      <td className="align-middle">
        <button
          type="button"
          className="rounded p-1 text-text-muted hover:bg-surface-elevated hover:text-text-primary"
          aria-label="Copy path or command"
          title="Copy path"
          onClick={() => {
            const text =
              entry.command ?? entry.location ?? entry.publisher ?? entry.name;
            void navigator.clipboard
              .writeText(text)
              .then(() => toastInfo('Copied to clipboard'))
              .catch(() => toastInfo(text));
          }}
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </td>
    </tr>
  );
}
