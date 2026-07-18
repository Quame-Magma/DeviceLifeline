import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
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
 * Crash events as accordion rows:
 * always show error type (severity) + title; details expand on click.
 */
export function CrashEventList({ events }: CrashEventListProps) {
  const { pageItems, pagination } = usePaginatedItems(events);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  if (events.length === 0) {
    return (
      <EmptyState
        heading="No crashes detected"
        body="Run a scan to read this device's event log for crashes, hangs, and unexpected shutdowns."
      />
    );
  }

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <ul className="divide-y divide-hairline rounded-card border border-hairline bg-surface-card" role="list">
        {pageItems.map((event) => {
          const severity = severityMeta(event.severity);
          const explanation = explainCrashEvent(event);
          const open = openIds.has(event.id);
          const panelId = `crash-event-panel-${event.id}`;
          const headerId = `crash-event-header-${event.id}`;

          return (
            <li key={event.id} data-testid={`crash-event-${event.id}`}>
              <button
                type="button"
                id={headerId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(event.id)}
                className="flex w-full items-start gap-3 px-panel-x py-3.5 text-left transition-colors hover:bg-surface-elevated/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/20"
              >
                <span
                  data-testid={`crash-severity-${event.id}`}
                  className={[
                    'mt-0.5 inline-flex shrink-0 items-center rounded-control border px-2 py-0.5 text-2xs font-medium capitalize',
                    severity.badgeClass,
                  ].join(' ')}
                >
                  {severity.label}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text-primary cause-semibold">
                    {explanation.heading}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {categoryLabel(event.category)}
                    <span className="text-text-ash"> · </span>
                    {formatTimestamp(event.occurredAt)}
                  </p>
                </div>

                <ChevronDown
                  aria-hidden
                  className={[
                    'mt-1 h-4 w-4 shrink-0 text-text-muted transition-transform duration-150',
                    open ? 'rotate-180' : '',
                  ].join(' ')}
                  strokeWidth={1.75}
                />
              </button>

              {open ? (
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={headerId}
                  className="border-t border-hairline bg-surface-elevated/30 px-panel-x py-panel-y"
                >
                  <p className="text-sm leading-relaxed text-text-secondary">
                    {explanation.whatHappened}
                  </p>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-control border border-hairline bg-surface-card px-3 py-2.5">
                      <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
                        Likely cause
                      </p>
                      <p className="mt-1 text-xs leading-5 text-text-secondary">
                        {explanation.likelyCause}
                      </p>
                    </div>
                    <div className="rounded-control border border-hairline bg-surface-card px-3 py-2.5">
                      <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
                        What to try next
                      </p>
                      <p className="mt-1 text-xs leading-5 text-text-secondary">
                        {explanation.recommendedAction}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-text-muted">
                    <span>{event.source}</span>
                    {event.eventId !== null ? (
                      <span>Event ID {event.eventId}</span>
                    ) : null}
                    <span>Recorded as: {event.title}</span>
                  </div>

                  {event.detail ? (
                    <div className="mt-3 rounded-control border border-hairline bg-surface-card px-3 py-2.5">
                      <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
                        Technical details
                      </p>
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-5 text-text-secondary">
                        {event.detail}
                      </p>
                    </div>
                  ) : null}
                </div>
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
