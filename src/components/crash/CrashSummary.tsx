import type { CrashEvent } from '../../types/device.types';

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

  const chips: { key: string; label: string; className: string }[] = [
    {
      key: 'total',
      label: `${events.length} total`,
      className: 'bg-surface text-text-secondary border-surface-border',
    },
    {
      key: 'critical',
      label: `${countBy('critical')} critical`,
      className: 'bg-status-error-bg text-status-error border-status-error/30',
    },
    {
      key: 'error',
      label: `${countBy('error')} error`,
      className:
        'bg-status-warning-bg text-status-warning border-status-warning/30',
    },
    {
      key: 'warning',
      label: `${countBy('warning')} warning`,
      className: 'bg-surface text-text-secondary border-surface-border',
    },
  ];

  return (
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
  );
}
