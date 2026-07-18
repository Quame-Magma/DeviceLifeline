import { useEffect, useMemo } from 'react';
import {
  FolderSearch,
  Gauge,
  HardDrive,
  ScanSearch,
  TriangleAlert,
} from 'lucide-react';
import type { View } from '../components/layout/Sidebar';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { HealthScoreRing } from '../components/common/HealthScoreRing';
import { Pagination } from '../components/common/Pagination';
import { StatusPill } from '../components/common/StatusPill';
import { useDeviceDna } from '../hooks/use-device-dna';
import { useHealth } from '../hooks/use-health';
import { useCrash } from '../hooks/use-crash';
import { useIntelligence } from '../hooks/use-intelligence';
import { usePaginatedItems } from '../hooks/use-pagination';
import { summarize } from '../lib/dashboard';
import { formatPercent, formatTimestamp } from '../lib/format';
import type { IntelligenceFinding } from '../types/device.types';

interface DashboardProps {
  onNavigate?: (view: View) => void;
}

function statusTone(
  score: number | null,
  critical: number,
): 'success' | 'warning' | 'error' | 'info' {
  if (critical > 0) return 'error';
  if (score === null) return 'info';
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'error';
}

function statusLabel(score: number | null, critical: number): string {
  if (critical > 0) return 'Needs attention';
  if (score === null) return 'Ready to scan';
  if (score >= 80) return 'Looking good';
  if (score >= 50) return 'Room to improve';
  return 'Under pressure';
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { snapshots, loadSnapshots, capture, capturing } = useDeviceDna();
  const { latest, alerts, loadHealth, collectSample, sampling } = useHealth();
  const { events: crashes, loadCrashEvents, scanCrashEvents, scanning } =
    useCrash();
  const {
    dashboard: intelligence,
    loading: intelligenceLoading,
    dismissing,
    loadDashboard: loadIntelligence,
    dismiss,
  } = useIntelligence();

  useEffect(() => {
    void loadSnapshots();
    void loadHealth();
    void loadCrashEvents();
    void loadIntelligence();
  }, [loadCrashEvents, loadHealth, loadIntelligence, loadSnapshots]);

  const stats = summarize({
    snapshots,
    latestHealth: latest,
    alerts,
    crashes,
    timelineEvents: [],
    restorePlans: [],
    latestRestoreJob: null,
    syncStatus: null,
  });

  const findings = useMemo(() => {
    const list = intelligence?.recentFindings ?? [];
    return list.filter((f) => !f.dismissed);
  }, [intelligence?.recentFindings]);

  const { pageItems: pageFindings, pagination: findingPages } =
    usePaginatedItems(findings);

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const score = stats.healthScore;
  const tone = statusTone(score, criticalCount + stats.crashCritical);
  const label = statusLabel(score, criticalCount + stats.crashCritical);

  const go = (view: View) => () => onNavigate?.(view);

  const runCheck = async () => {
    await Promise.all([
      capture(),
      collectSample(),
      scanCrashEvents(),
      loadIntelligence(),
    ]);
  };

  const checking = capturing || sampling || scanning || intelligenceLoading;

  return (
    <div className="page-shell page-section">
      <section className="panel px-6 py-7 sm:px-8">
        <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
          <div className="min-w-0 flex-1 text-center lg:text-left">
            <StatusPill tone={tone}>{label}</StatusPill>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
              Overview
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-muted lg:mx-0">
              {score === null
                ? 'Run a smart check to sample health, stability, and findings on this PC.'
                : criticalCount > 0 || stats.crashCritical > 0
                  ? 'Issues found. Review findings below or ask Copilot for a diagnosis.'
                  : 'No critical issues from the latest samples.'}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              <Button
                variant="primary"
                size="md"
                loading={checking}
                onClick={() => void runCheck()}
              >
                Smart check
              </Button>
              <Button variant="secondary" size="md" onClick={go('ai-detective')}>
                <ScanSearch className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Ask Copilot
              </Button>
              <Button variant="ghost" size="md" onClick={go('search')}>
                <FolderSearch className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Search
              </Button>
            </div>
          </div>
          <div className="flex-shrink-0">
            <HealthScoreRing
              score={score}
              checking={checking && score === null}
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-text-primary">
          Quick open
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <LabLink
            icon={Gauge}
            title="Health"
            detail={
              latest
                ? `CPU ${formatPercent(latest.cpuUsage)} · ${formatTimestamp(latest.capturedAt)}`
                : 'Sample live resources'
            }
            onClick={go('health')}
          />
          <LabLink
            icon={HardDrive}
            title="Storage"
            detail="Map disk use and safe cleanup"
            onClick={go('storage')}
          />
          <LabLink
            icon={TriangleAlert}
            title="Crashes"
            detail={
              stats.crashTotal > 0
                ? `${stats.crashTotal} recorded events`
                : 'Scan stability events'
            }
            onClick={go('crash-intelligence')}
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel-header flex items-center justify-between gap-3">
          <div>
            <p className="panel-title">Findings</p>
            <p className="panel-subtitle">Open intelligence signals</p>
          </div>
          <Button variant="ghost" size="sm" onClick={go('health')}>
            Open health
          </Button>
        </div>
        {findings.length === 0 ? (
          <p className="px-4 py-6 text-sm text-text-muted">
            No open findings yet. Run a smart check to populate intelligence.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-hairline">
              {pageFindings.map((finding) => (
                <FindingRow
                  key={finding.id}
                  finding={finding}
                  dismissing={dismissing}
                  onDismiss={(id) => void dismiss(id)}
                  onOpen={go(
                    finding.engine === 'storage'
                      ? 'storage'
                      : finding.engine === 'security'
                        ? 'security'
                        : 'processes',
                  )}
                />
              ))}
            </ul>
            <Pagination
              pagination={findingPages}
              itemLabel="findings"
            />
          </>
        )}
      </section>
    </div>
  );
}

function FindingRow({
  finding,
  onDismiss,
  onOpen,
  dismissing,
}: {
  finding: IntelligenceFinding;
  onDismiss: (id: string) => void;
  onOpen: () => void;
  dismissing: boolean;
}) {
  const tone =
    finding.severity === 'critical'
      ? 'error'
      : finding.severity === 'warning'
        ? 'warning'
        : 'neutral';

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={tone}>{finding.severity}</StatusPill>
          <span className="text-2xs text-text-muted">{finding.engine}</span>
        </div>
        <p className="mt-1 text-sm font-medium text-text-primary">
          {finding.title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">
          {finding.summary}
        </p>
      </button>
      <Button
        variant="ghost"
        size="sm"
        disabled={dismissing}
        onClick={() => onDismiss(finding.id)}
      >
        Dismiss
      </Button>
    </li>
  );
}

function LabLink({
  icon: Icon,
  title,
  detail,
  onClick,
}: {
  icon: typeof Gauge;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-card text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
    >
      <Card className="h-full group-hover:border-hairline-strong">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-control border border-hairline bg-surface-elevated text-text-secondary">
            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary">{title}</p>
            <p className="mt-0.5 text-xs text-text-muted">{detail}</p>
          </div>
        </div>
      </Card>
    </button>
  );
}
