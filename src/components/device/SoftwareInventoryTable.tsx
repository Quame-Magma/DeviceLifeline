import { useState } from 'react';
import type { SoftwareInventoryItem } from '../../types/device.types';
import { usePaginatedItems } from '../../hooks/use-pagination';
import { EmptyState } from '../common/EmptyState';
import { Pagination } from '../common/Pagination';

interface SoftwareInventoryTableProps {
  items: SoftwareInventoryItem[];
}

/**
 * Searchable, paginated software inventory table.
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

  const { pageItems, pagination } = usePaginatedItems(filtered);

  if (items.length === 0) {
    return (
      <EmptyState
        heading="No software found"
        body="This snapshot contains no software inventory items."
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="px-4 pt-1">
        <input
          type="search"
          placeholder="Search by name, publisher, or source…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="field"
          aria-label="Search software"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          heading="No results"
          body={`No software matches "${query}". Try a different search term.`}
        />
      ) : (
        <>
          <div className="flex-1 overflow-auto px-4 scrollbar-thin">
            <table className="data-table">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr>
                  <th>Name</th>
                  <th>Version</th>
                  <th>Publisher</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item) => (
                  <tr key={item.id}>
                    <td className="max-w-[280px] truncate font-medium text-text-primary">
                      {item.name}
                    </td>
                    <td className="font-mono text-xs">
                      {item.version ?? (
                        <span className="italic text-text-muted">—</span>
                      )}
                    </td>
                    <td className="max-w-[200px] truncate">
                      {item.publisher ?? (
                        <span className="italic text-text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className="inline-flex items-center rounded-control border border-hairline bg-surface-elevated px-2 py-0.5 text-2xs text-text-secondary">
                        {item.source}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={pagination} itemLabel="apps" />
        </>
      )}
    </div>
  );
}
