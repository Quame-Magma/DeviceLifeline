import { useState } from 'react';
import type { ConfigItem } from '../../types/device.types';
import { usePaginatedItems } from '../../hooks/use-pagination';
import { EmptyState } from '../common/EmptyState';
import { Pagination } from '../common/Pagination';

interface ConfigItemsTableProps {
  items: ConfigItem[];
}

type KindFilter =
  | 'all'
  | 'startup'
  | 'service'
  | 'scheduled_task'
  | 'browser_extension'
  | 'dev_tool'
  | 'hardware'
  | 'power'
  | 'network';

const KIND_LABELS: Record<string, string> = {
  startup: 'Startup',
  service: 'Service',
  scheduled_task: 'Scheduled task',
  browser_extension: 'Browser extension',
  dev_tool: 'Dev tool',
  hardware: 'Hardware',
  power: 'Power',
  network: 'Network',
};

function KindBadge({ kind }: { kind: string }) {
  const label = KIND_LABELS[kind] ?? kind;
  return (
    <span className="inline-flex items-center rounded-control border border-hairline bg-surface-elevated px-2 py-0.5 text-2xs text-text-secondary">
      {label}
    </span>
  );
}

const FILTER_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'startup', label: 'Startup' },
  { value: 'service', label: 'Services' },
  { value: 'scheduled_task', label: 'Tasks' },
  { value: 'browser_extension', label: 'Browser' },
  { value: 'dev_tool', label: 'Dev tools' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'power', label: 'Power' },
  { value: 'network', label: 'Network' },
];

export function ConfigItemsTable({ items }: ConfigItemsTableProps) {
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = items.filter((item) => {
    const matchesKind = kindFilter === 'all' || item.kind === kindFilter;
    const matchesQuery =
      !normalizedQuery ||
      item.name.toLowerCase().includes(normalizedQuery) ||
      (item.path ?? '').toLowerCase().includes(normalizedQuery) ||
      (item.status ?? '').toLowerCase().includes(normalizedQuery) ||
      (item.publisher ?? '').toLowerCase().includes(normalizedQuery) ||
      item.source.toLowerCase().includes(normalizedQuery);
    return matchesKind && matchesQuery;
  });

  const { pageItems, pagination } = usePaginatedItems(filtered);

  if (items.length === 0) {
    return (
      <EmptyState
        heading="No configuration items found"
        body="This snapshot contains no system-configuration items."
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="px-4 pt-1">
        <input
          type="search"
          placeholder="Search by name, path, or status…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="field"
          aria-label="Search configuration items"
        />
      </div>

      <div
        className="flex flex-wrap items-center gap-1.5 px-4"
        role="group"
        aria-label="Filter by kind"
      >
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setKindFilter(opt.value)}
            className={[
              'rounded-control px-2.5 py-1 text-xs font-medium transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25',
              kindFilter === opt.value
                ? 'bg-surface-card text-text-primary'
                : 'text-text-muted hover:bg-surface-elevated hover:text-text-primary',
            ].join(' ')}
            aria-pressed={kindFilter === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          heading="No results"
          body={
            normalizedQuery
              ? `No configuration items match "${query}".`
              : 'No configuration items match the selected filter.'
          }
        />
      ) : (
        <>
          <div className="flex-1 overflow-auto px-4 scrollbar-thin">
            <table className="data-table">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr>
                  <th>Kind</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Path</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <KindBadge kind={item.kind} />
                    </td>
                    <td className="max-w-[240px] truncate font-medium text-text-primary">
                      {item.name}
                    </td>
                    <td>
                      {item.status ?? (
                        <span className="italic text-text-muted">—</span>
                      )}
                    </td>
                    <td className="max-w-[280px] truncate font-mono text-xs">
                      {item.path ?? (
                        <span className="font-sans italic text-text-muted">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={pagination} itemLabel="items" />
        </>
      )}
    </div>
  );
}
