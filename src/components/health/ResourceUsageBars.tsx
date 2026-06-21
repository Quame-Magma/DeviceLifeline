import { formatBytes, formatPercent } from '../../lib/format';
import type { HealthSample } from '../../types/device.types';

interface ResourceUsageBarsProps {
  sample: HealthSample;
}

interface UsageRow {
  key: string;
  label: string;
  /** Usage as a percentage in 0..100. */
  pct: number;
  /** Secondary detail line (e.g., used / total bytes). */
  detail: string;
}

/** Returns `used / total` as a percentage, or 0 when total is non-positive. */
function ratioPct(used: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return (used / total) * 100;
}

/** Picks a status color for the fill based on how saturated the resource is. */
function barColor(pct: number): string {
  if (pct >= 85) {
    return 'bg-status-error';
  }
  if (pct >= 65) {
    return 'bg-status-warning';
  }
  return 'bg-status-success';
}

function diskDetail(sample: HealthSample): string {
  const usage = `${formatBytes(sample.diskUsed)} / ${formatBytes(sample.diskTotal)}`;
  const diskName = sample.diskName?.trim();

  if (diskName && sample.diskCount > 1) {
    return `${diskName} - ${usage} - highest usage across ${sample.diskCount} disks`;
  }

  if (diskName) {
    return `${diskName} - ${usage}`;
  }

  if (sample.diskCount > 1) {
    return `${usage} - highest usage across ${sample.diskCount} disks`;
  }

  return usage;
}

/**
 * Renders CPU, memory, and disk usage as labeled horizontal bars with a
 * percentage and a used/total detail line.
 */
export function ResourceUsageBars({ sample }: ResourceUsageBarsProps) {
  const rows: UsageRow[] = [
    {
      key: 'cpu',
      label: 'CPU',
      pct: sample.cpuUsage,
      detail: 'Overall utilization',
    },
    {
      key: 'memory',
      label: 'Memory',
      pct: ratioPct(sample.memoryUsed, sample.memoryTotal),
      detail: `${formatBytes(sample.memoryUsed)} / ${formatBytes(sample.memoryTotal)}`,
    },
    {
      key: 'disk',
      label: sample.diskCount > 1 ? 'Most constrained disk' : 'Disk',
      pct: ratioPct(sample.diskUsed, sample.diskTotal),
      detail: diskDetail(sample),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => {
        const width = Math.min(Math.max(row.pct, 0), 100);
        return (
          <div key={row.key} data-testid={`usage-bar-${row.key}`}>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-sm font-medium text-text-primary">
                {row.label}
              </span>
              <span
                data-testid={`usage-pct-${row.key}`}
                className="text-xs font-medium text-text-secondary"
              >
                {formatPercent(row.pct)}
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-surface-border"
              role="progressbar"
              aria-valuenow={Math.round(width)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${row.label} usage`}
            >
              <div
                className={['h-full rounded-full', barColor(width)].join(' ')}
                style={{ width: `${width}%` }}
              />
            </div>
            <p
              data-testid={`usage-detail-${row.key}`}
              className="mt-1 text-2xs text-text-muted"
            >
              {row.detail}
            </p>
          </div>
        );
      })}
    </div>
  );
}
