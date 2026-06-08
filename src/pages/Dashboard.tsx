import { useEffect } from 'react';
import type { ReactNode } from 'react';
import type { View } from '../components/layout/Sidebar';
import { APP_NAME, APP_TAGLINE } from '../lib/constants';
import { summarize } from '../lib/dashboard';
import { formatTimestamp } from '../lib/format';
import { useDeviceDna } from '../hooks/use-device-dna';
import { useHealth } from '../hooks/use-health';
import { useCrash } from '../hooks/use-crash';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';

interface DashboardProps {
  /** Navigate to another view (wired to the sidebar in `App`). */
  onNavigate?: (view: View) => void;
}

/** Text color for a HealthScore band. */
function healthColor(score: number): string {
  if (score >= 80) {
    return 'text-status-success';
  }
  if (score >= 50) {
    return 'text-status-warning';
  }
  return 'text-status-error';
}

interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: string;
  valueClass?: string;
  testId: string;
  onClick?: () => void;
}

/** A clickable summary tile that navigates to the related view. */
function StatCard({
  label,
  value,
  sub,
  valueClass,
  testId,
  onClick,
}: StatCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="rounded-card text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Card className="h-full transition-shadow hover:shadow-elevated">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {label}
        </p>
        <p
          className={['mt-2 text-2xl font-bold', valueClass ?? 'text-text-primary']
            .filter(Boolean)
            .join(' ')}
        >
          {value}
        </p>
        {sub && <p className="mt-1 text-xs text-text-muted">{sub}</p>}
      </Card>
    </button>
  );
}

/**
 * Dashboard — at-a-glance overview tying together Device DNA, Health, Crash
 * Intelligence, the Timeline, and Recovery. Each tile navigates to its section.
 */
export function Dashboard({ onNavigate }: DashboardProps) {
  const { snapshots, timelineEvents, loadSnapshots } = useDeviceDna();
  const { latest, alerts, loadHealth } = useHealth();
  const { events: crashes, loadCrashEvents } = useCrash();

  // Load the overview data on mount.
  useEffect(() => {
    void loadSnapshots();
    void loadHealth();
    void loadCrashEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = summarize({
    snapshots,
    latestHealth: latest,
    alerts,
    crashes,
    timelineEvents,
  });

  const go = (view: View) => () => onNavigate?.(view);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{APP_NAME}</h1>
        <p className="mt-1 text-sm text-text-secondary">{APP_TAGLINE}</p>
      </div>

      {stats.snapshotCount === 0 ? (
        <Card className="max-w-md">
          <h2 className="text-base font-semibold text-text-primary">
            Welcome to DeviceLifeline
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Capture your first Device DNA snapshot to start building your
            device&rsquo;s living history.
          </p>
          <div className="mt-4">
            <Button variant="primary" size="sm" onClick={go('device-dna')}>
              Go to Device DNA
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            testId="dashboard-stat-dna"
            label="Device DNA"
            value={`${stats.latestSnapshot?.softwareCount ?? 0} apps`}
            sub={
              stats.latestSnapshot
                ? `${stats.snapshotCount} snapshots · updated ${formatTimestamp(
                    stats.latestSnapshot.capturedAt,
                  )}`
                : `${stats.snapshotCount} snapshots`
            }
            onClick={go('device-dna')}
          />
          <StatCard
            testId="dashboard-stat-health"
            label="Health"
            value={stats.healthScore !== null ? String(stats.healthScore) : '—'}
            valueClass={
              stats.healthScore !== null
                ? healthColor(stats.healthScore)
                : 'text-text-muted'
            }
            sub={
              stats.activeAlerts > 0
                ? `${stats.activeAlerts} active alert${stats.activeAlerts === 1 ? '' : 's'}`
                : 'No active alerts'
            }
            onClick={go('health')}
          />
          <StatCard
            testId="dashboard-stat-crashes"
            label="Crashes"
            value={stats.crashTotal}
            valueClass={
              stats.crashCritical > 0 ? 'text-status-error' : 'text-text-primary'
            }
            sub={
              stats.crashCritical > 0
                ? `${stats.crashCritical} critical`
                : 'No critical crashes'
            }
            onClick={go('crash-intelligence')}
          />
          <StatCard
            testId="dashboard-stat-timeline"
            label="Timeline"
            value={stats.timelineCount}
            sub="change events"
            onClick={go('timeline')}
          />
          <StatCard
            testId="dashboard-stat-recovery"
            label="Recovery Center"
            value="Restore"
            sub="Rebuild or export a setup"
            onClick={go('recovery-center')}
          />
        </div>
      )}
    </div>
  );
}
