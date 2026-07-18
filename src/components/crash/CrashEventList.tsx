import { usePaginatedItems } from '../../hooks/use-pagination';
import { formatTimestamp } from '../../lib/format';
import type { CrashEvent } from '../../types/device.types';
import { EmptyState } from '../common/EmptyState';
import { Pagination } from '../common/Pagination';
import { categoryLabel, explainCrashEvent, severityMeta } from './display';

interface CrashEventListProps {
  events: CrashEvent[];
}

/**
 * Paginated crash event cards with plain-English explanations.
 */
export function CrashEventList({ events }: CrashEventListProps) {
  const { pageItems, pagination } = usePaginatedItems(events);

  if (events.length === 0) {
    return (
      <EmptyState
        heading="No crashes detected"
        body="Run a scan to read this device's event log for crashes, hangs, and unexpected shutdowns."
      />
    );
  }

  return (
    <div>
      <ul className="flex flex-col gap-3" role="list">
        {pageItems.map((event) => {
          const severity = severityMeta(event.severity);
          const explanation = explainCrashEvent(event);
          return (
            <li
              key={event.id}
              data-testid={`crash-event-${event.id}`}
              className="rounded-card border border-hairline bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    data-testid={`crash-severity-${event.id}`}
                    className={[
                      'inline-flex items-center rounded-control border px-2 py-0.5 text-2xs font-medium capitalize',
                      severity.badgeClass,
                    ].join(' ')}
                  >
                    {severity.label}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {categoryLabel(event.category)}
                  </span>
                </div>
                <time className="whitespace-nowrap text-2xs text-text-muted">
                  {formatTimestamp(event.occurredAt)}
                </time>
              </div>

              <p className="mt-3 text-sm font-semibold text-text-primary">
                {explanation.heading}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                {explanation.whatHappened}
              </p>

              <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                <div className="rounded-control border border-hairline bg-surface-elevated px-3 py-2.5">
                  <p className="text-xs text-text-muted">Likely cause</p>
                  <p className="mt-1 text-xs leading-5 text-text-secondary">
                    {explanation.likelyCause}
                  </p>
                </div>
                <div className="rounded-control border border-hairline bg-surface-elevated px-3 py-2.5">
                  <p className="text-xs text-text-muted">What to try next</p>
                  <p className="mt-1 text-xs leading-5 text-text-secondary">
                    {explanation.recommendedAction}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-2xs text-text-muted">
                <span>{event.source}</span>
                {event.eventId !== null && (
                  <span>Event ID {event.eventId}</span>
                )}
                <span>Recorded as: {event.title}</span>
              </div>

              {event.detail ? (
                <details className="mt-3 rounded-control border border-hairline bg-surface-elevated px-3 py-2 text-xs text-text-secondary">
                  <summary className="cursor-pointer select-none font-medium text-text-primary">
                    Technical details
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap break-words leading-5">
                    {event.detail}
                  </p>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
      <Pagination
        pagination={pagination}
        itemLabel="events"
        className="mt-3 border-t-0 px-0"
      />
    </div>
  );
}
