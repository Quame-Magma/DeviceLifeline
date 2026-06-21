import type { CrashEvent } from '../../types/device.types';
import { categoryLabel } from './display';

interface CrashSummaryProps {
  events: CrashEvent[];
}

/**
 * Compact tally of crash events by severity, plus a total. Rendered above the
 * event list to give an at-a-glance stability picture.
 */
export function CrashSummary({ events }: CrashSummaryProps) {
  const countBy = (severity: string) =>
    events.filter((event) => event.severity === severity).length;
  const critical = countBy('critical');
  const errors = countBy('error');
  const warnings = countBy('warning');

  const categoryCounts = events.reduce<Record<string, number>>((counts, event) => {
    counts[event.category] = (counts[event.category] ?? 0) + 1;
    return counts;
  }, {});
  const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];

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

  const chips: { key: string; label: string; className: string }[] = [
    {
      key: 'total',
      label: `${events.length} total`,
      className: 'bg-surface text-text-secondary border-surface-border',
    },
    {
      key: 'critical',
      label: `${critical} critical`,
      className: 'bg-status-error-bg text-status-error border-status-error/30',
    },
    {
      key: 'error',
      label: `${errors} error`,
      className:
        'bg-status-warning-bg text-status-warning border-status-warning/30',
    },
    {
      key: 'warning',
      label: `${warnings} warning`,
      className: 'bg-surface text-text-secondary border-surface-border',
    },
  ];

  return (
    <div className="rounded-card border border-surface-border bg-surface-card p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <span
            key={chip.key}
            data-testid={`crash-summary-${chip.key}`}
            className={[
              'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium',
              chip.className,
            ].join(' ')}
          >
            {chip.label}
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
            Readout
          </p>
          <p className="mt-1 text-sm font-medium text-text-primary">{verdict}</p>
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
