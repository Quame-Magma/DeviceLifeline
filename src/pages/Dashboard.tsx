import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArchiveRestore,
  Check,
  CloudBackup,
  HeartPulse,
  History,
  PackageCheck,
  RefreshCw,
  ScanLine,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { View } from '../components/layout/Sidebar';
import { APP_NAME, APP_TAGLINE } from '../lib/constants';
import {
  summarize,
  type DashboardAttentionItem,
  type DashboardAttentionSeverity,
  type DashboardReadinessState,
} from '../lib/dashboard';
import { formatTimestamp } from '../lib/format';
import { syncStatusLabel } from '../lib/sync';
import { useDeviceDna } from '../hooks/use-device-dna';
import { useHealth } from '../hooks/use-health';
import { useCrash } from '../hooks/use-crash';
import { useRecovery } from '../hooks/use-recovery';
import { useSync } from '../hooks/use-sync';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import logoAsset from '../assets/logo.png';

interface DashboardProps {
  /** Navigate to another view (wired to the sidebar in `App`). */
  onNavigate?: (view: View) => void;
}

function readinessClasses(state: DashboardReadinessState): string {
  if (state === 'ready') {
    return 'border-status-success/30 bg-status-success-bg text-status-success';
  }
  if (state === 'attention') {
    return 'border-status-warning/30 bg-status-warning-bg text-status-warning';
  }
  return 'border-accent/25 bg-accent-subtle text-accent';
}

function severityClasses(severity: DashboardAttentionSeverity): string {
  if (severity === 'critical') {
    return 'border-status-error/30 bg-status-error-bg text-status-error';
  }
  if (severity === 'warning') {
    return 'border-status-warning/30 bg-status-warning-bg text-status-warning';
  }
  return 'border-status-success/30 bg-status-success-bg text-status-success';
}

interface OverviewTileProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  detail: string;
  tone?: 'default' | 'success' | 'warning' | 'error';
  onClick?: () => void;
  testId: string;
}

function OverviewTile({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'default',
  onClick,
  testId,
}: OverviewTileProps) {
  const toneClass =
    tone === 'success'
      ? 'text-status-success'
      : tone === 'warning'
        ? 'text-status-warning'
        : tone === 'error'
          ? 'text-status-error'
          : 'text-text-primary';

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="rounded-card text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Card className="h-full transition-shadow hover:shadow-elevated">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-surface-border bg-surface">
            <Icon aria-hidden="true" className="h-4 w-4 text-accent" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              {label}
            </p>
            <p className={['mt-1 text-xl font-semibold', toneClass].join(' ')}>
              {value}
            </p>
            <p className="mt-1 text-xs leading-5 text-text-muted">{detail}</p>
          </div>
        </div>
      </Card>
    </button>
  );
}

interface CommandButtonProps {
  icon: LucideIcon;
  children: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

function CommandButton({
  icon: Icon,
  children,
  loading,
  disabled,
  onClick,
  variant = 'secondary',
}: CommandButtonProps) {
  return (
    <Button
      variant={variant}
      size="sm"
      loading={loading}
      disabled={disabled}
      onClick={onClick}
    >
      {!loading && <Icon aria-hidden="true" className="h-4 w-4" />}
      {children}
    </Button>
  );
}

interface AttentionRowProps {
  item: DashboardAttentionItem;
  onAction: (item: DashboardAttentionItem) => void;
}

function AttentionRow({ item, onAction }: AttentionRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-surface-border py-3 last:border-b-0">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={[
            'mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded border',
            severityClasses(item.severity),
          ].join(' ')}
        >
          {item.severity === 'info' ? (
            <Check aria-hidden="true" className="h-4 w-4" />
          ) : (
            <TriangleAlert aria-hidden="true" className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary">{item.title}</p>
          <p className="mt-0.5 text-xs leading-5 text-text-secondary">
            {item.detail}
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="flex-shrink-0"
        onClick={() => onAction(item)}
      >
        {item.action}
      </Button>
    </div>
  );
}

interface DetailLineProps {
  label: string;
  value: ReactNode;
  muted?: boolean;
}

function DetailLine({ label, value, muted }: DetailLineProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-surface-border py-2.5 last:border-b-0">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <span
        className={[
          'max-w-[60%] text-right text-xs',
          muted ? 'text-text-muted' : 'text-text-primary',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Recovery overview tying together Device DNA, Health, Crash Intelligence,
 * Timeline, Recovery, and the local sync queue.
 */
export function Dashboard({ onNavigate }: DashboardProps) {
  const {
    snapshots,
    timelineEvents,
    loadSnapshots,
    capture,
    capturing,
    error: dnaError,
  } = useDeviceDna();
  const {
    latest,
    alerts,
    loadHealth,
    collectSample,
    sampling,
    error: healthError,
  } = useHealth();
  const {
    events: crashes,
    loadCrashEvents,
    scanCrashEvents,
    scanning,
    error: crashError,
  } = useCrash();
  const {
    plans,
    latestJob,
    loadPlans,
    createPlan,
    running,
    error: recoveryError,
  } = useRecovery();
  const {
    status: syncStatus,
    syncing,
    error: syncError,
    loadStatus,
    sync,
  } = useSync();
  const [creatingPlan, setCreatingPlan] = useState(false);

  useEffect(() => {
    void loadSnapshots();
    void loadHealth();
    void loadCrashEvents();
    void loadPlans();
    void loadStatus();
  }, [loadCrashEvents, loadHealth, loadPlans, loadSnapshots, loadStatus]);

  const stats = summarize({
    snapshots,
    latestHealth: latest,
    alerts,
    crashes,
    timelineEvents,
    restorePlans: plans,
    latestRestoreJob: latestJob,
    syncStatus,
  });

  const go = (view: View) => () => onNavigate?.(view);

  const handleCreatePlan = async () => {
    if (!stats.latestSnapshot) {
      onNavigate?.('device-dna');
      return;
    }
    setCreatingPlan(true);
    try {
      await createPlan(stats.latestSnapshot.id);
    } finally {
      setCreatingPlan(false);
    }
  };

  const handleAttentionAction = (item: DashboardAttentionItem) => {
    if (item.id === 'baseline-missing') {
      void capture();
    } else if (item.id === 'health-missing') {
      void collectSample();
    } else if (item.id === 'active-health-alerts') {
      onNavigate?.('health');
    } else if (item.id === 'critical-crashes') {
      onNavigate?.('crash-intelligence');
    } else if (item.id === 'restore-plan-missing') {
      void handleCreatePlan();
    } else if (item.id === 'sync-failed') {
      void sync();
    } else {
      onNavigate?.('recovery-center');
    }
  };

  const errors = [
    dnaError,
    healthError,
    crashError,
    recoveryError,
    syncError,
  ].filter(Boolean);

  const baselineDetail = stats.latestSnapshot
    ? `${stats.latestSnapshot.configCount} config items · ${formatTimestamp(
        stats.latestSnapshot.capturedAt,
      )}`
    : 'Capture the first filtered snapshot';
  const healthDetail =
    stats.healthScore === null
      ? 'No health sample recorded'
      : stats.activeAlerts > 0
        ? `${stats.activeAlerts} active alert${
            stats.activeAlerts === 1 ? '' : 's'
          }`
        : 'No active alerts';
  const crashDetail =
    stats.crashCritical > 0
      ? `${stats.crashCritical} critical event${
          stats.crashCritical === 1 ? '' : 's'
        }`
      : `${stats.crashTotal} recorded event${stats.crashTotal === 1 ? '' : 's'}`;
  const recoveryDetail = stats.latestRestorePlan
    ? `${stats.latestRestorePlan.stepCount} planned install step${
        stats.latestRestorePlan.stepCount === 1 ? '' : 's'
      }`
    : 'Create a dry-run plan from the baseline';

  return (
    <div className="flex min-h-full flex-col bg-surface">
      <header className="flex flex-shrink-0 items-center justify-between gap-5 border-b border-surface-border bg-surface-card px-6 py-4">
        <div className="flex min-w-0 items-center gap-4">
          <img
            src={logoAsset}
            alt={APP_NAME}
            className="hidden h-10 w-[190px] flex-shrink-0 rounded bg-white object-contain object-left sm:block"
          />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-text-primary">
              Recovery Overview
            </h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              {APP_TAGLINE} Local baseline, health, stability, and restore
              readiness in one place.
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <CommandButton
            icon={ScanLine}
            variant="primary"
            loading={capturing}
            onClick={() => void capture()}
          >
            Capture snapshot
          </CommandButton>
          <CommandButton
            icon={HeartPulse}
            loading={sampling}
            onClick={() => void collectSample()}
          >
            Sample health
          </CommandButton>
          <CommandButton
            icon={RefreshCw}
            loading={scanning}
            onClick={() => void scanCrashEvents()}
          >
            Scan crashes
          </CommandButton>
          <CommandButton
            icon={ArchiveRestore}
            loading={creatingPlan}
            disabled={!stats.latestSnapshot || running}
            onClick={() => void handleCreatePlan()}
          >
            Create plan
          </CommandButton>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-5 overflow-auto p-6 scrollbar-thin">
        {errors.length > 0 && (
          <div
            role="alert"
            className="rounded-card border border-status-error/30 bg-status-error-bg px-4 py-3 text-sm text-status-error"
          >
            <p className="font-semibold">Some local data could not be refreshed</p>
            <p className="mt-1 text-xs text-status-error/80">
              {errors[0]} {errors.length > 1 ? `(+${errors.length - 1} more)` : ''}
            </p>
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-4">
            <Card padding="md">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    MVP recovery readiness
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <span
                      className={[
                        'inline-flex items-center rounded border px-2.5 py-1 text-xs font-semibold',
                        readinessClasses(stats.readiness.state),
                      ].join(' ')}
                    >
                      {stats.readiness.label}
                    </span>
                    <span className="text-xs text-text-muted">
                      {stats.readiness.readyChecks}/{stats.readiness.totalChecks}{' '}
                      checks complete
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-text-secondary">
                    {stats.readiness.detail}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={go('recovery-center')}>
                  Open Recovery Center
                </Button>
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <OverviewTile
                testId="dashboard-stat-dna"
                icon={PackageCheck}
                label="Baseline"
                value={
                  stats.latestSnapshot
                    ? `${stats.latestSnapshot.softwareCount} apps`
                    : 'Missing'
                }
                detail={baselineDetail}
                tone={stats.latestSnapshot ? 'success' : 'warning'}
                onClick={go('device-dna')}
              />
              <OverviewTile
                testId="dashboard-stat-health"
                icon={HeartPulse}
                label="Health"
                value={stats.healthScore !== null ? stats.healthScore : 'No sample'}
                detail={healthDetail}
                tone={
                  stats.healthScore === null
                    ? 'warning'
                    : stats.healthScore >= 80
                      ? 'success'
                      : stats.healthScore >= 50
                        ? 'warning'
                        : 'error'
                }
                onClick={go('health')}
              />
              <OverviewTile
                testId="dashboard-stat-crashes"
                icon={TriangleAlert}
                label="Stability"
                value={
                  stats.crashCritical > 0
                    ? `${stats.crashCritical} critical`
                    : 'No critical'
                }
                detail={crashDetail}
                tone={stats.crashCritical > 0 ? 'error' : 'success'}
                onClick={go('crash-intelligence')}
              />
              <OverviewTile
                testId="dashboard-stat-recovery"
                icon={ArchiveRestore}
                label="Restore"
                value={
                  stats.restorePlanCount > 0
                    ? `${stats.restorePlanCount} plan${
                        stats.restorePlanCount === 1 ? '' : 's'
                      }`
                    : 'No plan'
                }
                detail={recoveryDetail}
                tone={stats.restorePlanCount > 0 ? 'success' : 'warning'}
                onClick={go('recovery-center')}
              />
            </div>

            <Card padding="md">
              <div className="mb-1 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Needs attention
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    Prioritized work before treating this PC as recoverable.
                  </p>
                </div>
              </div>
              <div className="mt-1">
                {stats.attentionItems.map((item) => (
                  <AttentionRow
                    key={item.id}
                    item={item}
                    onAction={handleAttentionAction}
                  />
                ))}
              </div>
            </Card>
          </div>

          <aside className="flex flex-col gap-4">
            <Card padding="md">
              <div className="flex items-center gap-2">
                <ArchiveRestore aria-hidden="true" className="h-4 w-4 text-accent" />
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Recovery state
                </p>
              </div>
              <div className="mt-3">
                <DetailLine
                  label="Latest baseline"
                  value={
                    stats.latestSnapshot
                      ? formatTimestamp(stats.latestSnapshot.capturedAt)
                      : 'Not captured'
                  }
                  muted={!stats.latestSnapshot}
                />
                <DetailLine
                  label="Inventory"
                  value={
                    stats.latestSnapshot
                      ? `${stats.latestSnapshot.softwareCount} apps · ${stats.latestSnapshot.configCount} config`
                      : 'Waiting for snapshot'
                  }
                  muted={!stats.latestSnapshot}
                />
                <DetailLine
                  label="Restore plan"
                  value={
                    stats.latestRestorePlan
                      ? `${stats.latestRestorePlan.stepCount} steps`
                      : 'Not created'
                  }
                  muted={!stats.latestRestorePlan}
                />
                <DetailLine
                  label="Latest run"
                  value={stats.latestRestoreJob?.status ?? 'No dry run yet'}
                  muted={!stats.latestRestoreJob}
                />
              </div>
              <p className="mt-3 rounded border border-accent/20 bg-accent-subtle px-3 py-2 text-xs leading-5 text-accent">
                Restore execution defaults to dry run; install mode stays inside
                Recovery Center.
              </p>
            </Card>

            <Card padding="md">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <CloudBackup aria-hidden="true" className="h-4 w-4 text-accent" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Local queue
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={syncing}
                  disabled={syncing}
                  onClick={() => void sync()}
                >
                  Sync now
                </Button>
              </div>
              <p className="mt-3 text-sm text-text-primary">
                {syncError ?? (syncStatus ? syncStatusLabel(syncStatus) : 'Checking…')}
              </p>
              {syncStatus && (
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded border border-surface-border bg-surface px-2 py-2">
                    <p className="text-base font-semibold text-text-primary">
                      {syncStatus.pending}
                    </p>
                    <p className="text-2xs text-text-muted">Queued</p>
                  </div>
                  <div className="rounded border border-surface-border bg-surface px-2 py-2">
                    <p className="text-base font-semibold text-status-success">
                      {syncStatus.synced}
                    </p>
                    <p className="text-2xs text-text-muted">Synced</p>
                  </div>
                  <div className="rounded border border-surface-border bg-surface px-2 py-2">
                    <p className="text-base font-semibold text-status-error">
                      {syncStatus.failed}
                    </p>
                    <p className="text-2xs text-text-muted">Failed</p>
                  </div>
                </div>
              )}
            </Card>
          </aside>
        </section>

        <Card padding="md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <History aria-hidden="true" className="h-4 w-4 text-accent" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Recent device changes
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  Latest software and configuration movement from snapshots.
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={go('timeline')}>
              View timeline
            </Button>
          </div>

          {stats.recentTimelineEvents.length === 0 ? (
            <div className="mt-4 rounded border border-surface-border bg-surface px-4 py-5 text-sm text-text-secondary">
              Capture at least two snapshots to build a change history.
            </div>
          ) : (
            <div className="mt-3 divide-y divide-surface-border">
              {stats.recentTimelineEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {event.title}
                    </p>
                    {event.detail && (
                      <p className="mt-0.5 truncate text-xs text-text-secondary">
                        {event.detail}
                      </p>
                    )}
                  </div>
                  <span className="flex-shrink-0 text-xs text-text-muted">
                    {formatTimestamp(event.occurredAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
