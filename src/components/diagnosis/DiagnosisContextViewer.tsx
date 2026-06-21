import type { DiagnosisContext } from '../../types/device.types';

interface DiagnosisContextViewerProps {
  context: DiagnosisContext;
}

/** Formats a nullable percentage. */
function pctText(value: number | null): string {
  return value === null ? 'n/a' : `${Math.round(value)}%`;
}

/** Joins a list for display, or "none" when empty. */
function listText(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'none';
}

/**
 * Transparency panel: a collapsible view of exactly the on-device
 * summaries the AI Detective analyzed. No raw file data is ever included.
 */
export function DiagnosisContextViewer({
  context,
}: DiagnosisContextViewerProps) {
  const rows: [string, string][] = [
    [
      'Health score',
      context.healthScore !== null ? String(context.healthScore) : 'n/a',
    ],
    ['CPU', pctText(context.cpuUsage)],
    ['Memory', pctText(context.memoryPct)],
    ['Disk', pctText(context.diskPct)],
    ['Active alerts', listText(context.activeAlertKinds)],
    ['Recent crashes', listText(context.recentCrashCategories)],
    ['Recent changes', String(context.recentChangeTitles.length)],
    ['Software tracked', String(context.softwareCount)],
  ];

  return (
    <details
      data-testid="diagnosis-context"
      className="rounded-card border border-surface-border bg-surface-card p-4"
    >
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-text-secondary">
        What this analysis used
      </summary>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="text-text-muted">{label}</dt>
            <dd className="text-right text-text-primary">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-2xs text-text-muted">
        Only these on-device summaries are analyzed — never your files.
      </p>
    </details>
  );
}
