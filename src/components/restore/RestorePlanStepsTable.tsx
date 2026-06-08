import { useState } from 'react';
import type { RestorePlanStep } from '../../types/device.types';
import { EmptyState } from '../common/EmptyState';

interface RestorePlanStepsTableProps {
  steps: RestorePlanStep[];
}

/**
 * Searchable table of steps belonging to a restore plan.
 * Columns: order, software name, target version, source.
 */
export function RestorePlanStepsTable({ steps }: RestorePlanStepsTableProps) {
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? steps.filter(
        (step) =>
          step.softwareName.toLowerCase().includes(normalizedQuery) ||
          (step.targetVersion ?? '').toLowerCase().includes(normalizedQuery) ||
          step.source.toLowerCase().includes(normalizedQuery),
      )
    : steps;

  if (steps.length === 0) {
    return (
      <EmptyState
        heading="No steps"
        body="This plan has no install steps."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Search input */}
      <div className="px-4 pt-1">
        <input
          type="search"
          placeholder="Search by name, version, or source…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={[
            'w-full rounded border border-surface-border bg-white px-3 py-2',
            'text-sm text-text-primary placeholder:text-text-muted',
            'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent',
            'transition-colors duration-150',
          ].join(' ')}
          aria-label="Search plan steps"
        />
      </div>

      {/* Results count */}
      <p className="px-4 text-xs text-text-muted" aria-live="polite">
        {filtered.length === steps.length
          ? `${steps.length} steps`
          : `${filtered.length} of ${steps.length} steps`}
      </p>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          heading="No results"
          body={`No steps match "${query}". Try a different search term.`}
        />
      ) : (
        <div className="flex-1 overflow-auto scrollbar-thin px-4 pb-4">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-surface border-b border-surface-border">
                <th
                  scope="col"
                  className="py-2.5 pr-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide w-12"
                >
                  #
                </th>
                <th
                  scope="col"
                  className="py-2.5 pr-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide"
                >
                  Software
                </th>
                <th
                  scope="col"
                  className="py-2.5 pr-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide"
                >
                  Target version
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
              {filtered.map((step) => (
                <tr
                  key={step.id}
                  className="hover:bg-surface/60 transition-colors duration-75"
                >
                  <td className="py-2.5 pr-4 font-mono text-xs text-text-muted">
                    {step.orderIndex + 1}
                  </td>
                  <td className="py-2.5 pr-4 font-medium text-text-primary max-w-[280px] truncate">
                    {step.softwareName}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-text-secondary">
                    {step.targetVersion ?? (
                      <span className="text-text-muted italic">—</span>
                    )}
                  </td>
                  <td className="py-2.5">
                    <span className="inline-flex items-center rounded-full bg-surface-border px-2 py-0.5 text-2xs font-medium text-text-secondary">
                      {step.source}
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
