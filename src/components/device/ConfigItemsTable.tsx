import { useState } from 'react';
import type { ConfigItem } from '../../types/device.types';
import { EmptyState } from '../common/EmptyState';

interface ConfigItemsTableProps {
  items: ConfigItem[];
}

type KindFilter = 'all' | 'startup' | 'service' | 'scheduled_task';

const KIND_LABELS: Record<string, string> = {
  startup: 'Startup',
  service: 'Service',
  scheduled_task: 'Scheduled task',
};

const KIND_BADGE_CLASSES: Record<string, string> = {
  startup:
    'bg-status-info-bg text-status-info border border-status-info/20',
  service:
    'bg-accent-subtle text-accent border border-accent/20',
  scheduled_task:
    'bg-surface-border text-text-secondary border border-surface-border',
};

function KindBadge({ kind }: { kind: string }) {
  const label = KIND_LABELS[kind] ?? kind;
  const classes =
    KIND_BADGE_CLASSES[kind] ??
    'bg-surface-border text-text-secondary border border-surface-border';
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium',
        classes,
      ].join(' ')}
    >
      {label}
    </span>
  );
}

const FILTER_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'startup', label: 'Startup' },
  { value: 'service', label: 'Services' },
  { value: 'scheduled_task', label: 'Scheduled tasks' },
];

/**
 * Searchable, filterable table displaying system-configuration items.
 * Client-side filtering on Name, Path, or Status; kind filter via toggle buttons.
 * Handles the empty (no items) and no-results states internally.
 */
export function ConfigItemsTable({ items }: ConfigItemsTableProps) {
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = items.filter((item) => {
    const matchesKind =
      kindFilter === 'all' || item.kind === kindFilter;
    const matchesQuery =
      !normalizedQuery ||
      item.name.toLowerCase().includes(normalizedQuery) ||
      (item.path ?? '').toLowerCase().includes(normalizedQuery) ||
      (item.status ?? '').toLowerCase().includes(normalizedQuery);
    return matchesKind && matchesQuery;
  });

  if (items.length === 0) {
    return (
      <EmptyState
        heading="No configuration items found"
        body="This snapshot contains no system-configuration items."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Search input */}
      <div className="px-4 pt-1">
        <input
          type="search"
          placeholder="Search by name, path, or status…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={[
            'w-full rounded border border-surface-border bg-white px-3 py-2',
            'text-sm text-text-primary placeholder:text-text-muted',
            'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent',
            'transition-colors duration-150',
          ].join(' ')}
          aria-label="Search configuration items"
        />
      </div>

      {/* Kind filter */}
      <div className="px-4 flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filter by kind">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setKindFilter(opt.value)}
            className={[
              'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-100',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              kindFilter === opt.value
                ? 'bg-accent text-white'
                : 'bg-surface-border text-text-secondary hover:bg-surface hover:text-text-primary',
            ].join(' ')}
            aria-pressed={kindFilter === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Results count */}
      <p className="px-4 text-xs text-text-muted" aria-live="polite">
        {filtered.length === items.length
          ? `${items.length} items`
          : `${filtered.length} of ${items.length} items`}
      </p>

      {/* Table or no-results */}
      {filtered.length === 0 ? (
        <EmptyState
          heading="No results"
          body={
            normalizedQuery
              ? `No configuration items match "${query}". Try a different search term.`
              : 'No configuration items match the selected filter.'
          }
        />
      ) : (
        <div className="flex-1 overflow-auto scrollbar-thin px-4 pb-4">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-surface border-b border-surface-border">
                <th
                  scope="col"
                  className="py-2.5 pr-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide"
                >
                  Kind
                </th>
                <th
                  scope="col"
                  className="py-2.5 pr-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide"
                >
                  Name
                </th>
                <th
                  scope="col"
                  className="py-2.5 pr-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="py-2.5 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide"
                >
                  Path
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-surface/60 transition-colors duration-75"
                >
                  <td className="py-2.5 pr-4">
                    <KindBadge kind={item.kind} />
                  </td>
                  <td className="py-2.5 pr-4 font-medium text-text-primary max-w-[240px] truncate">
                    {item.name}
                  </td>
                  <td className="py-2.5 pr-4 text-text-secondary">
                    {item.status ?? (
                      <span className="text-text-muted italic">—</span>
                    )}
                  </td>
                  <td className="py-2.5 font-mono text-xs text-text-secondary max-w-[280px] truncate">
                    {item.path ?? (
                      <span className="text-text-muted italic not-italic font-sans">—</span>
                    )}
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
