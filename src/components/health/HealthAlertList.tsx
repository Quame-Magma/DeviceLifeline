import { Button } from '../common/Button';
import { formatTimestamp } from '../../lib/format';
import type { HealthAlert } from '../../types/device.types';

interface HealthAlertListProps {
  alerts: HealthAlert[];
  onAcknowledge: (alertId: string) => void;
}

/** Border/background/text classes for an alert by severity. */
function severityClass(severity: string): string {
  if (severity === 'critical') {
    return 'border-status-error/30 bg-status-error-bg text-status-error';
  }
  return 'border-status-warning/30 bg-status-warning-bg text-status-warning';
}

/**
 * Renders health alerts as colored banners. Unacknowledged alerts show an
 * "Acknowledge" action; acknowledged alerts are dimmed and labeled.
 */
export function HealthAlertList({ alerts, onAcknowledge }: HealthAlertListProps) {
  return (
    <ul className="flex flex-col gap-2" role="list">
      {alerts.map((alert) => (
        <li
          key={alert.id}
          data-testid={`alert-${alert.id}`}
          className={[
            'flex items-start justify-between gap-3 rounded border px-4 py-3',
            severityClass(alert.severity),
            alert.acknowledged ? 'opacity-60' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{alert.title}</span>
              <span className="text-2xs font-medium uppercase tracking-wide">
                {alert.severity}
              </span>
            </div>
            <p className="mt-0.5 text-xs">{alert.detail}</p>
            <p className="mt-0.5 text-2xs opacity-80">
              {formatTimestamp(alert.createdAt)}
            </p>
          </div>
          {alert.acknowledged ? (
            <span
              data-testid={`alert-state-${alert.id}`}
              className="whitespace-nowrap text-2xs font-medium uppercase tracking-wide opacity-80"
            >
              Acknowledged
            </span>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              data-testid={`alert-ack-${alert.id}`}
              onClick={() => onAcknowledge(alert.id)}
            >
              Acknowledge
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
