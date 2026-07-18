import { useState } from 'react';
import type { TimelineEvent } from '../../types/device.types';
import { usePaginatedItems } from '../../hooks/use-pagination';
import { Pagination } from '../common/Pagination';

interface TimelineEventListProps {
  events: TimelineEvent[];
}

type CategoryFilter = 'all' | 'software' | 'config';

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: 'All',
  software: 'Software',
  config: 'Config',
};

const CATEGORY_FILTERS: CategoryFilter[] = ['all', 'software', 'config'];

function badgeClasses(eventType: string): string {
  if (eventType === 'software_install' || eventType === 'config_added') {
    return 'border-status-success/25 bg-status-success-bg text-status-success';
  }
  if (eventType === 'software_removal' || eventType === 'config_removed') {
    return 'border-status-error/25 bg-status-error-bg text-status-error';
  }
  return 'border-status-warning/25 bg-status-warning-bg text-status-warning';
}

function eventTypeLabel(eventType: string): string {
  switch (eventType) {
    case 'software_install':
      return 'Install';
    case 'software_removal':
      return 'Removal';
    case 'software_update':
      return 'Update';
    case 'config_added':
      return 'Added';
    case 'config_removed':
      return 'Removed';
    default:
      return eventType;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TimelineEventList({ events }: TimelineEventListProps) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const filtered =
    categoryFilter === 'all'
      ? events
      : events.filter((e) => e.category === categoryFilter);

  const { pageItems, pagination } = usePaginatedItems(filtered);

  return (
    <div className="flex h-full flex-col gap-3">
      <div
        className="flex gap-1 px-4 pt-1"
        role="group"
        aria-label="Filter by category"
      >
        {CATEGORY_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={categoryFilter === f}
            onClick={() => setCategoryFilter(f)}
            className={[
              'rounded-control px-2.5 py-1 text-xs font-medium transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25',
              categoryFilter === f
                ? 'bg-surface-card text-text-primary'
                : 'text-text-muted hover:bg-surface-elevated hover:text-text-primary',
            ].join(' ')}
          >
            {CATEGORY_LABELS[f]}
          </button>
        ))}
      </div>

      {events.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 py-10">
          <p className="text-center text-sm text-text-muted">
            No changes recorded yet — capture a snapshot after making changes.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 py-10">
          <p className="text-center text-sm text-text-muted">
            No events in this category.
          </p>
        </div>
      ) : (
        <>
          <ul
            className="flex-1 space-y-2 overflow-auto px-4 scrollbar-thin"
            aria-label="Timeline events"
          >
            {pageItems.map((event) => (
              <li
                key={event.id}
                className="flex flex-col gap-1 rounded-card border border-hairline bg-surface px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={[
                      'inline-flex items-center rounded-control border px-2 py-0.5 text-2xs font-medium capitalize',
                      badgeClasses(event.eventType),
                    ].join(' ')}
                  >
                    {eventTypeLabel(event.eventType)}
                  </span>
                  <span className="text-sm font-medium text-text-primary">
                    {event.title}
                  </span>
                </div>
                {event.detail !== null ? (
                  <p className="font-mono text-xs text-text-muted">
                    {event.detail}
                  </p>
                ) : null}
                <p className="text-2xs text-text-muted">
                  {formatDate(event.occurredAt)}
                </p>
              </li>
            ))}
          </ul>
          <Pagination pagination={pagination} itemLabel="events" />
        </>
      )}
    </div>
  );
}
