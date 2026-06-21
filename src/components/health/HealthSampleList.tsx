import { EmptyState } from '../common/EmptyState';
import { formatPercent, formatTimestamp } from '../../lib/format';
import type { HealthSample } from '../../types/device.types';
import { diskPct, memoryPct } from './insights';

interface HealthSampleListProps {
  samples: HealthSample[];
}

function diskTitle(sample: HealthSample): string {
  const diskName = sample.diskName?.trim();

  if (diskName && sample.diskCount > 1) {
    return `${diskName}, highest usage across ${sample.diskCount} disks`;
  }

  if (diskName) {
    return diskName;
  }

  if (sample.diskCount > 1) {
    return `Highest usage across ${sample.diskCount} disks`;
  }

  return 'Disk usage';
}

/**
 * Tabular history of recent health samples. Shows an empty state when there is
 * no history yet.
 */
export function HealthSampleList({ samples }: HealthSampleListProps) {
  if (samples.length === 0) {
    return (
      <EmptyState
        heading="No samples yet"
        body="Take a sample to start building this device's health history."
      />
    );
  }

  return (
    <table className="w-full text-sm" data-testid="health-sample-table">
      <thead>
        <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-text-secondary">
          <th className="py-2 pr-4 font-semibold">Captured</th>
          <th className="py-2 pr-4 font-semibold">Score</th>
          <th className="py-2 pr-4 font-semibold">CPU</th>
          <th className="py-2 pr-4 font-semibold">Memory</th>
          <th className="py-2 font-semibold">Disk</th>
        </tr>
      </thead>
      <tbody>
        {samples.map((sample) => (
          <tr
            key={sample.id}
            data-testid={`health-sample-row-${sample.id}`}
            className="border-b border-surface-border/60"
          >
            <td className="whitespace-nowrap py-2 pr-4 text-text-secondary">
              {formatTimestamp(sample.capturedAt)}
            </td>
            <td className="py-2 pr-4 font-semibold text-text-primary">
              {sample.healthScore}
            </td>
            <td className="py-2 pr-4 text-text-secondary">
              {formatPercent(sample.cpuUsage)}
            </td>
            <td className="py-2 pr-4 text-text-secondary">
              {formatPercent(memoryPct(sample))}
            </td>
            <td className="py-2 text-text-secondary" title={diskTitle(sample)}>
              {formatPercent(diskPct(sample))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
