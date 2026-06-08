import { useState } from 'react';
import type { TimelineEvent } from '../../types/device.types';

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

/** Returns Tailwind badge classes based on event type. */
function badgeClasses(eventType: string): string {
  if (
    eventType === 'software_install' ||
    eventType === 'config_added'
  ) {
    return 'bg-green-100 text-green-800';
  }
  if (
    eventType === 'software_removal' ||
    eventType === 'config_removed'
  ) {
    return 'bg-red-100 text-red-800';
  }
  // software_update
  return 'bg-amber-100 text-amber-800';
}

/** Human-readable label for an event type. */
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

/** Format an ISO date string to a readable local date+time. */
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

/**
 * Presentational list of timeline events.
 * Renders events newest-first (already ordered by the API) with a colored type
 * badge, title, muted detail, and formatted timestamp.
 * Supports category filtering (All / Software / Config).
 */
export function TimelineEventList({ events }: TimelineEventListProps) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const filtered =
    categoryFilter === 'all'
      ? events
      : events.filter((e) => e.category === categoryFilter);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Category filter */}
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
              'rounded px-3 py-1.5 text-xs font-medium transition-colors duration-100',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              categoryFilter === f
                ? 'bg-accent text-white'
                : 'bg-surface border border-surface-border text-text-secondary hover:text-text-primary hover:bg-surface-border',
            ].join(' ')}
          >
            {CATEGORY_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Event count */}
      <p className="px-4 text-xs text-text-muted" aria-live="polite">
        {filtered.length === events.length
          ? `${events.length} event${events.length === 1 ? '' : 's'}`
          : `${filtered.length} of ${events.length} event${events.length === 1 ? '' : 's'}`}
      </p>

      {/* Events or empty state */}
      {events.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <p className="text-sm text-text-muted text-center">
            No changes recorded yet — capture a snapshot after making changes.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <p className="text-sm text-text-muted text-center">
            No events in this category.
          </p>
        </div>
      ) : (
        <ul
          className="flex-1 overflow-auto scrollbar-thin px-4 pb-4 space-y-2"
          aria-label="Timeline events"
        >
          {filtered.map((event) => (
            <li
              key={event.id}
              className="rounded border border-surface-border bg-surface-card px-4 py-3 flex flex-col gap-1 shadow-sm"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={[
                    'inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide',
                    badgeClasses(event.eventType),
                  ].join(' ')}
                >
                  {eventTypeLabel(event.eventType)}
                </span>
                <span className="text-sm font-medium text-text-primary">
                  {event.title}
                </span>
              </div>
              {event.detail !== null && (
                <p className="text-xs text-text-muted font-mono">
                  {event.detail}
                </p>
              )}
              <p className="text-2xs text-text-muted">
                {formatDate(event.occurredAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
