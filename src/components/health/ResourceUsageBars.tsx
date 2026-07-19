import { Cpu, HardDrive, MemoryStick } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatBytes, formatPercent } from '../../lib/format';
import type { HealthSample } from '../../types/device.types';

interface ResourceUsageBarsProps {
  sample: HealthSample;
}

interface UsageRow {
  key: string;
  label: string;
  pct: number;
  detail: string;
  icon: LucideIcon;
}

function ratioPct(used: number, total: number): number {
  if (total <= 0) return 0;
  return (used / total) * 100;
}

function barColor(pct: number): string {
  if (pct >= 85) return 'bg-status-error';
  if (pct >= 65) return 'bg-status-warning';
  return 'bg-status-success';
}

function diskDetail(sample: HealthSample): string {
  const usage = `${formatBytes(sample.diskUsed)} / ${formatBytes(sample.diskTotal)}`;
  const diskName = sample.diskName?.trim();

  if (diskName && sample.diskCount > 1) {
    return `${diskName} · ${usage} · Highest usage across ${sample.diskCount} disks`;
  }
  if (diskName) return `${diskName} · ${usage}`;
  if (sample.diskCount > 1) {
    return `${usage} · Highest usage across ${sample.diskCount} disks`;
  }
  return usage;
}

/**
 * Resource bars with icons — matches Health mock (CPU / Memory / Disk).
 */
export function ResourceUsageBars({ sample }: ResourceUsageBarsProps) {
  const rows: UsageRow[] = [
    {
      key: 'cpu',
      label: 'CPU',
      pct: sample.cpuUsage,
      detail: 'Overall utilization',
      icon: Cpu,
    },
    {
      key: 'memory',
      label: 'Memory',
      pct: ratioPct(sample.memoryUsed, sample.memoryTotal),
      detail: `${formatBytes(sample.memoryUsed)} / ${formatBytes(sample.memoryTotal)}`,
      icon: MemoryStick,
    },
    {
      key: 'disk',
      label: sample.diskCount > 1 ? 'Most constrained disk' : 'Disk',
      pct: ratioPct(sample.diskUsed, sample.diskTotal),
      detail: diskDetail(sample),
      icon: HardDrive,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => {
        const width = Math.min(Math.max(row.pct, 0), 100);
        const Icon = row.icon;
        return (
          <div key={row.key} data-testid={`usage-bar-${row.key}`}>
            <div className="mb-1.5 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <Icon
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary cause-semibold">
                    {row.label}
                  </p>
                  <p
                    data-testid={`usage-detail-${row.key}`}
                    className="mt-0.5 text-2xs leading-relaxed text-text-muted"
                  >
                    {row.detail}
                  </p>
                </div>
              </div>
              <span
                data-testid={`usage-pct-${row.key}`}
                className="shrink-0 text-sm font-medium tabular-nums text-text-secondary"
              >
                {formatPercent(row.pct)}
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]"
              role="progressbar"
              aria-valuenow={Math.round(width)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${row.label} usage`}
            >
              <div
                className={[
                  'h-full rounded-full transition-[width] duration-500 ease-ray',
                  barColor(width),
                ].join(' ')}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
