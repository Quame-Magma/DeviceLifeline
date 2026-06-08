import { useState } from 'react';
import type { SoftwareInventoryItem } from '../../types/device.types';
import { EmptyState } from '../common/EmptyState';

interface SoftwareInventoryTableProps {
  items: SoftwareInventoryItem[];
}

/**
 * Searchable table displaying a software inventory.
 * Client-side filtering on Name, Publisher, or Source.
 * Handles the empty (no items) and no-results states internally.
 */
export function SoftwareInventoryTable({
  items,
}: SoftwareInventoryTableProps) {
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? items.filter(
        (item) =>
          item.name.toLowerCase().includes(normalizedQuery) ||
          (item.publisher ?? '').toLowerCase().includes(normalizedQuery) ||
          item.source.toLowerCase().includes(normalizedQuery),
      )
    : items;

  if (items.length === 0) {
    return (
      <EmptyState
        heading="No software found"
        body="This snapshot contains no software inventory items."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Search input */}
      <div className="px-4 pt-1">
        <input
          type="search"
          placeholder="Search by name, publisher, or source…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={[
            'w-full rounded border border-surface-border bg-white px-3 py-2',
            'text-sm text-text-primary placeholder:text-text-muted',
            'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent',
            'transition-colors duration-150',
          ].join(' ')}
          aria-label="Search software"
        />
      </div>

      {/* Results count */}
      <p className="px-4 text-xs text-text-muted" aria-live="polite">
        {filtered.length === items.length
          ? `${items.length} items`
          : `${filtered.length} of ${items.length} items`}
      </p>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          heading="No results"
          body={`No software matches "${query}". Try a different search term.`}
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
                  Name
                </th>
                <th
                  scope="col"
                  className="py-2.5 pr-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide"
                >
                  Version
                </th>
                <th
                  scope="col"
                  className="py-2.5 pr-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide"
                >
                  Publisher
                </th>
                <th
                  scope="col"
                  className="py-2.5 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide"
                >
                  Source
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-surface/60 transition-colors duration-75"
                >
                  <td className="py-2.5 pr-4 font-medium text-text-primary max-w-[280px] truncate">
                    {item.name}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-text-secondary">
                    {item.version ?? (
                      <span className="text-text-muted italic">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-text-secondary max-w-[200px] truncate">
                    {item.publisher ?? (
                      <span className="text-text-muted italic">—</span>
                    )}
                  </td>
                  <td className="py-2.5">
                    <span className="inline-flex items-center rounded-full bg-surface-border px-2 py-0.5 text-2xs font-medium text-text-secondary">
                      {item.source}
                    </span>
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
