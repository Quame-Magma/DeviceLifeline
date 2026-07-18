import type { CrashEvent } from '../../types/device.types';
import { categoryLabel } from './display';

/** Severity filter for the Crashes page event list. */
export type CrashSeverityFilter = 'all' | 'critical' | 'error' | 'warning';

interface CrashSummaryProps {
  events: CrashEvent[];
  /** Active filter chip. Defaults to all. */
  filter?: CrashSeverityFilter;
  /** Called when the user clicks a severity chip. */
  onFilterChange?: (filter: CrashSeverityFilter) => void;
}

/**
 * Compact tally of crash events by severity. Chips are clickable filters
 * for the event list below.
 */
export function CrashSummary({
  events,
  filter = 'all',
  onFilterChange,
}: CrashSummaryProps) {
  const countBy = (severity: string) =>
    events.filter((event) => event.severity === severity).length;
  const critical = countBy('critical');
  const errors = countBy('error');
  const warnings = countBy('warning');

  const categoryCounts = events.reduce<Record<string, number>>(
    (counts, event) => {
      counts[event.category] = (counts[event.category] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const topCategory = Object.entries(categoryCounts).sort(
    (a, b) => b[1] - a[1],
  )[0];

  const verdict =
    events.length === 0
      ? 'No crash history has been captured yet.'
      : critical > 0
        ? `${critical} critical event${critical === 1 ? '' : 's'} need review first.`
        : errors > 0
          ? `${errors} app or system error${errors === 1 ? '' : 's'} were found.`
          : 'Only warning-level stability events were found.';
  const focus = topCategory
    ? `${categoryLabel(topCategory[0])} is the most common pattern (${topCategory[1]} event${
        topCategory[1] === 1 ? '' : 's'
      }).`
    : 'Scan this device to identify stability patterns.';
  const nextStep =
    critical > 0
      ? 'Open the newest critical card first, then compare nearby power, driver, and app events.'
      : errors > 0
        ? 'Look for repeated app names or modules before changing system settings.'
        : 'Monitor for repeats; warnings are usually less urgent unless they cluster.';

  const chips: {
    key: CrashSeverityFilter;
    label: string;
    idleClass: string;
    activeClass: string;
  }[] = [
    {
      key: 'all',
      label: `${events.length} total`,
      idleClass: 'bg-surface-elevated text-text-secondary border-hairline',
      activeClass:
        'bg-surface-card text-text-primary border-hairline-strong ring-2 ring-white/15',
    },
    {
      key: 'critical',
      label: `${critical} critical`,
      idleClass: 'bg-status-error-bg text-status-error border-status-error/30',
      activeClass:
        'bg-status-error-bg text-status-error border-status-error ring-2 ring-status-error/40',
    },
    {
      key: 'error',
      label: `${errors} error`,
      idleClass:
        'bg-status-warning-bg text-status-warning border-status-warning/30',
      activeClass:
        'bg-status-warning-bg text-status-warning border-status-warning ring-2 ring-status-warning/40',
    },
    {
      key: 'warning',
      label: `${warnings} warning`,
      idleClass: 'bg-surface-elevated text-text-secondary border-hairline',
      activeClass:
        'bg-surface-card text-text-primary border-hairline-strong ring-2 ring-white/15',
    },
  ];

  const interactive = typeof onFilterChange === 'function';

  return (
    <div className="panel p-4">
      <div
        className="flex flex-wrap items-center gap-2"
        role={interactive ? 'tablist' : undefined}
        aria-label={interactive ? 'Filter crash events by severity' : undefined}
      >
        {chips.map((chip) => {
          const active = filter === chip.key;
          const className = [
            'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            active ? chip.activeClass : chip.idleClass,
            interactive
              ? 'cursor-pointer hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25'
              : '',
          ]
            .filter(Boolean)
            .join(' ');

          if (!interactive) {
            return (
              <span
                key={chip.key}
                data-testid={`crash-summary-${chip.key}`}
                className={className}
              >
                {chip.label}
              </span>
            );
          }

          return (
            <button
              key={chip.key}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`crash-summary-${chip.key}`}
              className={className}
              onClick={() => onFilterChange(chip.key)}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
            Readout
          </p>
          <p className="mt-1 text-sm font-medium text-text-primary">
            {verdict}
          </p>
        </div>
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
            Pattern
          </p>
          <p className="mt-1 text-sm text-text-secondary">{focus}</p>
        </div>
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
            Next step
          </p>
          <p className="mt-1 text-sm text-text-secondary">{nextStep}</p>
        </div>
      </div>
    </div>
  );
}
