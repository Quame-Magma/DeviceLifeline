import { Button } from '../common/Button';
import { formatTimestamp } from '../../lib/format';
import type { HealthAlert } from '../../types/device.types';

interface HealthAlertListProps {
  alerts: HealthAlert[];
  onAcknowledge: (alertId: string) => void;
}

function severityClass(severity: string): string {
  if (severity === 'critical') {
    return 'border-status-error/30 bg-gradient-to-r from-status-error/15 to-transparent';
  }
  return 'border-status-warning/30 bg-gradient-to-r from-status-warning/12 to-transparent';
}

function severityDot(severity: string): string {
  if (severity === 'critical') return 'bg-status-error';
  return 'bg-status-warning';
}

/**
 * Open alerts list — red/amber tinted cards matching Health mock.
 */
export function HealthAlertList({
  alerts,
  onAcknowledge,
}: HealthAlertListProps) {
  return (
    <ul className="flex flex-col gap-2" role="list">
      {alerts.map((alert) => (
        <li
          key={alert.id}
          data-testid={`alert-${alert.id}`}
          className={[
            'flex items-start justify-between gap-3 rounded-control border px-panel-x py-3',
            severityClass(alert.severity),
            alert.acknowledged ? 'opacity-75' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="flex min-w-0 flex-1 gap-2.5">
            <span
              className={[
                'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                severityDot(alert.severity),
              ].join(' ')}
              aria-hidden
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-text-primary">
                  {alert.title}
                </span>
                <span className="rounded border border-current/20 px-1.5 py-px text-2xs font-semibold uppercase tracking-wide text-status-warning">
                  {alert.severity}
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
                {alert.detail}
              </p>
              <p className="mt-1 text-2xs text-text-muted">
                {formatTimestamp(alert.createdAt)}
              </p>
            </div>
          </div>
          {alert.acknowledged ? (
            <span
              data-testid={`alert-state-${alert.id}`}
              className="shrink-0 whitespace-nowrap pt-0.5 text-2xs font-semibold uppercase tracking-wide text-text-muted"
            >
              Acknowledged
            </span>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              data-testid={`alert-ack-${alert.id}`}
              onClick={() => onAcknowledge(alert.id)}
              className="shrink-0"
            >
              Acknowledge
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
