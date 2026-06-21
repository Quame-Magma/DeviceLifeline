import { EmptyState } from '../common/EmptyState';
import { formatTimestamp } from '../../lib/format';
import type { CrashEvent } from '../../types/device.types';
import { categoryLabel, explainCrashEvent, severityMeta } from './display';

interface CrashEventListProps {
  events: CrashEvent[];
}

/**
 * Vertical list of crash events as cards. Each card leads with a plain-English
 * explanation and keeps raw Windows event-log text behind a disclosure.
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
        const explanation = explainCrashEvent(event);
        return (
          <li
            key={event.id}
            data-testid={`crash-event-${event.id}`}
            className="rounded-card border border-surface-border bg-surface-card p-5 shadow-card"
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

            <p className="mt-3 text-base font-semibold text-text-primary">
              {explanation.heading}
            </p>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              {explanation.whatHappened}
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded border border-surface-border bg-surface px-3 py-2.5">
                <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
                  Likely cause
                </p>
                <p className="mt-1 text-xs leading-5 text-text-secondary">
                  {explanation.likelyCause}
                </p>
              </div>
              <div className="rounded border border-accent/20 bg-accent-subtle px-3 py-2.5">
                <p className="text-2xs font-semibold uppercase tracking-wide text-accent">
                  What to try next
                </p>
                <p className="mt-1 text-xs leading-5 text-text-secondary">
                  {explanation.recommendedAction}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-2xs text-text-muted">
              <span>{event.source}</span>
              {event.eventId !== null && <span>Event ID {event.eventId}</span>}
              <span>Recorded as: {event.title}</span>
            </div>

            {event.detail && (
              <details className="mt-3 rounded border border-surface-border bg-surface px-3 py-2 text-xs text-text-secondary">
                <summary className="cursor-pointer select-none font-medium text-text-primary">
                  Technical details
                </summary>
                <p className="mt-2 whitespace-pre-wrap break-words leading-5">
                  {event.detail}
                </p>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
