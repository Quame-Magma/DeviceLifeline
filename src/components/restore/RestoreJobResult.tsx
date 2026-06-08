import type { RestoreJob, RestoreStepResult } from '../../types/device.types';

interface RestoreJobResultProps {
  job: RestoreJob;
  stepResults: RestoreStepResult[];
}

type JobStatus = 'running' | 'completed' | 'completed_with_errors' | 'failed';
type StepStatus = 'succeeded' | 'failed' | 'skipped';

const JOB_STATUS_CLASSES: Record<JobStatus, string> = {
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-status-success-bg text-status-success',
  completed_with_errors: 'bg-amber-100 text-amber-700',
  failed: 'bg-status-error-bg text-status-error',
};

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  running: 'Running',
  completed: 'Completed',
  completed_with_errors: 'Completed with errors',
  failed: 'Failed',
};

const STEP_STATUS_CLASSES: Record<StepStatus, string> = {
  succeeded: 'bg-status-success-bg text-status-success',
  failed: 'bg-status-error-bg text-status-error',
  skipped: 'bg-surface-border text-text-secondary',
};

const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  succeeded: 'Succeeded',
  failed: 'Failed',
  skipped: 'Skipped',
};

function isJobStatus(s: string): s is JobStatus {
  return ['running', 'completed', 'completed_with_errors', 'failed'].includes(
    s,
  );
}

function isStepStatus(s: string): s is StepStatus {
  return ['succeeded', 'failed', 'skipped'].includes(s);
}

/**
 * Displays the result of a completed (or running) restore job.
 * Shows a status badge, summary counts, and a per-step result table.
 */
export function RestoreJobResult({ job, stepResults }: RestoreJobResultProps) {
  const statusKey = isJobStatus(job.status) ? job.status : 'failed';
  const statusClass = JOB_STATUS_CLASSES[statusKey];
  const statusLabel = JOB_STATUS_LABELS[statusKey];

  return (
    <div className="flex flex-col gap-4">
      {/* Status badge + summary counts */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          data-testid="job-status-badge"
          className={[
            'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
            statusClass,
          ].join(' ')}
        >
          {statusLabel}
        </span>

        <span
          data-testid="succeeded-count"
          className="text-xs text-text-secondary"
        >
          <span className="font-semibold text-status-success">
            {job.succeededCount}
          </span>{' '}
          succeeded
        </span>
        <span
          data-testid="failed-count"
          className="text-xs text-text-secondary"
        >
          <span className="font-semibold text-status-error">
            {job.failedCount}
          </span>{' '}
          failed
        </span>
        <span
          data-testid="skipped-count"
          className="text-xs text-text-secondary"
        >
          <span className="font-semibold text-text-muted">
            {job.skippedCount}
          </span>{' '}
          skipped
        </span>
        <span className="text-xs text-text-muted ml-auto">
          {job.totalSteps} total
        </span>
      </div>

      {/* Per-step result rows */}
      {stepResults.length > 0 && (
        <div className="overflow-auto scrollbar-thin">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-surface border-b border-surface-border">
                <th
                  scope="col"
                  className="py-2 pr-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide"
                >
                  Software
                </th>
                <th
                  scope="col"
                  className="py-2 pr-4 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="py-2 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide"
                >
                  Message
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {stepResults.map((result) => {
                const stepKey = isStepStatus(result.status)
                  ? result.status
                  : 'failed';
                const stepClass = STEP_STATUS_CLASSES[stepKey];
                const stepLabel = STEP_STATUS_LABELS[stepKey];

                return (
                  <tr
                    key={result.id}
                    className="hover:bg-surface/60 transition-colors duration-75"
                  >
                    <td className="py-2 pr-4 font-medium text-text-primary max-w-[240px] truncate">
                      {result.softwareName}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        data-testid={`step-status-badge-${result.id}`}
                        className={[
                          'inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold',
                          stepClass,
                        ].join(' ')}
                      >
                        {stepLabel}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-text-secondary max-w-[300px] truncate">
                      {result.message ?? (
                        <span className="text-text-muted italic">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
