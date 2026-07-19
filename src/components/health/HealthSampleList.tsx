import { EmptyState } from '../common/EmptyState';
import { formatPercent, formatTimestamp } from '../../lib/format';
import type { HealthSample } from '../../types/device.types';
import { diskPct, memoryPct } from './insights';

interface HealthSampleListProps {
  samples: HealthSample[];
}

function scorePillClass(score: number): string {
  if (score >= 80) {
    return 'bg-status-success-bg text-status-success border-status-success/30';
  }
  if (score >= 50) {
    return 'bg-status-warning-bg text-status-warning border-status-warning/30';
  }
  return 'bg-status-error-bg text-status-error border-status-error/30';
}

function diskTitle(sample: HealthSample): string {
  const diskName = sample.diskName?.trim();
  if (diskName && sample.diskCount > 1) {
    return `${diskName}, highest usage across ${sample.diskCount} disks`;
  }
  if (diskName) return diskName;
  if (sample.diskCount > 1) {
    return `Highest usage across ${sample.diskCount} disks`;
  }
  return 'Disk usage';
}

/**
 * Recent samples table — score shown as colored pills (mock).
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
    <div className="overflow-x-auto">
      <table className="data-table" data-testid="health-sample-table">
        <thead>
          <tr>
            <th>Captured</th>
            <th className="text-center">Score</th>
            <th className="text-right">CPU</th>
            <th className="text-right">Memory</th>
            <th className="text-right">Disk</th>
          </tr>
        </thead>
        <tbody>
          {samples.map((sample) => (
            <tr
              key={sample.id}
              data-testid={`health-sample-row-${sample.id}`}
            >
              <td className="whitespace-nowrap text-text-secondary">
                {formatTimestamp(sample.capturedAt)}
              </td>
              <td className="text-center">
                <span
                  className={[
                    'inline-flex min-w-[2rem] items-center justify-center rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                    scorePillClass(sample.healthScore),
                  ].join(' ')}
                >
                  {sample.healthScore}
                </span>
              </td>
              <td className="text-right tabular-nums text-text-secondary">
                {formatPercent(sample.cpuUsage)}
              </td>
              <td className="text-right tabular-nums text-text-secondary">
                {formatPercent(memoryPct(sample))}
              </td>
              <td
                className="text-right tabular-nums text-text-secondary"
                title={diskTitle(sample)}
              >
                {formatPercent(diskPct(sample))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
