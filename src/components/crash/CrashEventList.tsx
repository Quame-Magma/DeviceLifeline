import { EmptyState } from '../common/EmptyState';
import { formatTimestamp } from '../../lib/format';
import type { CrashEvent } from '../../types/device.types';
import { categoryLabel, severityMeta } from './display';

interface CrashEventListProps {
  events: CrashEvent[];
}

/**
 * Vertical list of crash events as cards. Each card shows a severity badge, the
 * category, a plain-English title, when it occurred, and the raw detail. Shows
 * an empty state when there is no history.
 */
export function CrashEventList({ events }: CrashEventListProps) {
  if (events.length === 0) {
    return (
      <EmptyState
        heading="No crashes detected"
        body="Run a scan to read this device's event log for crashes, hangs, and unexpected shutdowns."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3" role="list">
      {events.map((event) => {
        const severity = severityMeta(event.severity);
        return (
          <li
            key={event.id}
            data-testid={`crash-event-${event.id}`}
            className="rounded-card border border-surface-border bg-surface-card p-4 shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  data-testid={`crash-severity-${event.id}`}
                  className={[
                    'inline-flex items-center rounded border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide',
                    severity.badgeClass,
                  ].join(' ')}
                >
                  {severity.label}
                </span>
                <span className="text-xs font-medium text-text-secondary">
                  {categoryLabel(event.category)}
                </span>
              </div>
              <time className="whitespace-nowrap text-2xs text-text-muted">
                {formatTimestamp(event.occurredAt)}
              </time>
            </div>

            <p className="mt-2 text-sm font-semibold text-text-primary">
              {event.title}
            </p>
            {event.detail && (
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                {event.detail}
              </p>
            )}
            <p className="mt-2 text-2xs text-text-muted">
              {event.source}
              {event.eventId !== null ? ` · Event ID ${event.eventId}` : ''}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
