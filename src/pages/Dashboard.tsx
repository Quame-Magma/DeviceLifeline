import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Brush,
  ChevronRight,
  CircuitBoard,
  Activity,
  CloudDownload,
  Cpu,
  FileSpreadsheet,
  HardDrive,
  LayoutDashboard,
  MemoryStick,
  Play,
  Search,
  Thermometer,
  Timer,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { View } from '../components/layout/Sidebar';
import { Button } from '../components/common/Button';
import { useDeviceDna } from '../hooks/use-device-dna';
import { useHealth } from '../hooks/use-health';
import { useCrash } from '../hooks/use-crash';
import { useHardware } from '../hooks/use-hardware';
import { useIntelligence } from '../hooks/use-intelligence';
import { summarize } from '../lib/dashboard';
import { formatBytes, formatPercent } from '../lib/format';
import type {
  HealthSample,
  HardwareSample,
  IntelligenceFinding,
  TimelineEvent,
} from '../types/device.types';

interface DashboardProps {
  onNavigate?: (view: View) => void;
}

function timeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function displayName(): string {
  try {
    const raw = localStorage.getItem('devicelifeline.displayName');
    if (raw && raw.trim()) return raw.trim();
  } catch {
    /* ignore */
  }
  return 'there';
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const mins = Math.round((Date.now() - t) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function scoreLabel(score: number | null): string {
  if (score === null) return 'No sample yet';
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Needs attention';
}

function severityTone(
  severity: string,
): 'error' | 'warning' | 'info' | 'neutral' {
  const s = severity.toLowerCase();
  if (s === 'critical' || s === 'high' || s === 'error') return 'error';
  if (s === 'warning' || s === 'medium') return 'warning';
  if (s === 'info' || s === 'low') return 'info';
  return 'neutral';
}

function severityBadgeLabel(severity: string): string {
  const s = severity.toLowerCase();
  if (s === 'critical' || s === 'error') return 'High';
  if (s === 'warning') return 'Medium';
  if (s === 'info') return 'Low';
  return severity;
}

/**
 * Overview dashboard — layout matches the approved PC intelligence mock:
 * greeting, PC Health hero + trend, resource tiles, findings | quick actions,
 * system timeline.
 */
export function Dashboard({ onNavigate }: DashboardProps) {
  const {
    snapshots,
    timelineEvents,
    loadSnapshots,
    loadTimeline,
  } = useDeviceDna();
  const { latest, samples, alerts, loadHealth, collectSample, sampling } =
    useHealth();
  const {
    events: crashes,
    loadCrashEvents,
  } = useCrash();
  const {
    latest: hardware,
    loadHardware,
    collectSample: sampleHw,
    sampling: hwSampling,
  } = useHardware();
  const {
    dashboard: intelligence,
    loadDashboard: loadIntelligence,
  } = useIntelligence();
  /** Smart-check phase label — keeps UI honest while work runs off the main thread. */
  const [checkPhase, setCheckPhase] = useState<string | null>(null);

  useEffect(() => {
    void loadSnapshots();
    void loadHealth();
    void loadCrashEvents();
    void loadIntelligence();
    void loadTimeline();
    // Load last cached hardware sample only — do not auto-run a full SMART
    // harvest on every Overview open (that freezes weaker PCs).
    void loadHardware();
  }, [
    loadCrashEvents,
    loadHealth,
    loadHardware,
    loadIntelligence,
    loadSnapshots,
    loadTimeline,
  ]);

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
    return list.filter((f) => !f.dismissed).slice(0, 4);
  }, [intelligence?.recentFindings]);

  const score =
    intelligence?.healthScore && intelligence.healthScore > 0
      ? intelligence.healthScore
      : stats.healthScore;

  const historyAsc = useMemo(() => {
    const list = [...(samples ?? [])].sort(
      (a, b) =>
        new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
    );
    return list.slice(-14);
  }, [samples]);

  const scoreDelta = useMemo(() => {
    if (historyAsc.length < 2 || score === null) return null;
    const prev = historyAsc[historyAsc.length - 2]?.healthScore;
    if (prev === undefined) return null;
    return score - prev;
  }, [historyAsc, score]);

  const lastCheckAt = latest?.capturedAt ?? null;
  const openFindingCount = findings.length || intelligence?.openFindings || 0;

  const go = (view: View) => () => onNavigate?.(view);

  /**
   * Smart Check — keep the machine responsive:
   * 1) Health sample (sysinfo only — fast)
   * 2) Light hardware sample (no full SMART / PDH / LHM pack)
   * 3) Intelligence refresh (DB only)
   *
   * DNA capture + crash event-log scans are intentionally NOT part of Smart
   * Check — they thrash disk/registry and make the whole PC feel frozen.
   * Use Device DNA / Stability pages for those deeper jobs.
   */
  const runCheck = async () => {
    if (checkPhase) return;
    try {
      setCheckPhase('CPU, memory & disk…');
      try {
        await collectSample();
      } catch {
        /* continue */
      }
      // Yield a paint frame so the button/label update before the next IPC.
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      setCheckPhase('Sensors & storage…');
      try {
        await sampleHw('quick');
      } catch {
        /* sensors may be unavailable */
      }
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      setCheckPhase('Updating score…');
      try {
        await loadIntelligence();
      } catch {
        /* optional */
      }
      await loadHealth();
    } finally {
      setCheckPhase(null);
    }
  };

  const checking = checkPhase !== null || sampling || hwSampling;

  const memPct =
    latest && latest.memoryTotal > 0
      ? (latest.memoryUsed / latest.memoryTotal) * 100
      : null;
  const diskFreePct =
    latest && latest.diskTotal > 0
      ? ((latest.diskTotal - latest.diskUsed) / latest.diskTotal) * 100
      : null;
  const diskUsedPct =
    latest && latest.diskTotal > 0
      ? (latest.diskUsed / latest.diskTotal) * 100
      : null;

  const cpuSeries = historyAsc.map((s) => s.cpuUsage);
  const memSeries = historyAsc.map((s) =>
    s.memoryTotal > 0 ? (s.memoryUsed / s.memoryTotal) * 100 : 0,
  );
  const diskSeries = historyAsc.map((s) =>
    s.diskTotal > 0 ? (s.diskUsed / s.diskTotal) * 100 : 0,
  );
  const scoreSeries = historyAsc.map((s) => s.healthScore);

  const { gpuUsage, cpuTemp, gpuTemp, gpuName } = useMemo(
    () => extractHardwareMetrics(hardware),
    [hardware],
  );
  const displayTemp = cpuTemp ?? gpuTemp;

  const timelineItems = useMemo(
    () =>
      buildTimelineItems(
        timelineEvents,
        latest,
        crashes.length,
        snapshots.length,
      ),
    [timelineEvents, latest, crashes.length, snapshots.length],
  );

  return (
    <div className="page-shell page-section">
      {/* Greeting */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
            {timeOfDayGreeting()}, {displayName()}{' '}
            <span aria-hidden="true">👋</span>
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Here&apos;s the status of your PC
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={go('settings')}
          className="self-start"
        >
          <LayoutDashboard className="h-3.5 w-3.5" strokeWidth={1.75} />
          Customize dashboard
        </Button>
      </div>

      {/* PC Health hero */}
      <section className="panel overflow-hidden">
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,200px)_minmax(0,1fr)_minmax(0,200px)] lg:items-center lg:gap-8 lg:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              PC Health
            </p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-5xl font-semibold tabular-nums tracking-tight text-text-primary">
                {score ?? '—'}
              </span>
              {score !== null ? (
                <span className="text-lg text-text-muted">/100</span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={
                  score !== null && score >= 70
                    ? 'text-sm font-medium text-status-success'
                    : score !== null && score >= 50
                      ? 'text-sm font-medium text-status-warning'
                      : 'text-sm font-medium text-text-secondary'
                }
              >
                {scoreLabel(score)}
              </span>
              {scoreDelta !== null && scoreDelta !== 0 ? (
                <span
                  className={
                    scoreDelta > 0
                      ? 'rounded-full bg-status-success-bg px-2 py-0.5 text-2xs font-medium text-status-success'
                      : 'rounded-full bg-status-error-bg px-2 py-0.5 text-2xs font-medium text-status-error'
                  }
                >
                  {scoreDelta > 0 ? '↑' : '↓'} {Math.abs(scoreDelta)} pts
                </span>
              ) : null}
            </div>
          </div>

          <div className="min-w-0">
            <HealthTrendChart samples={historyAsc} series={scoreSeries} />
          </div>

          <div className="flex flex-col items-stretch gap-3 lg:items-end lg:text-right">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
                Last smart check
              </p>
              <p className="mt-0.5 text-lg font-semibold text-text-primary">
                {relativeTime(lastCheckAt)}
              </p>
              <p
                className={
                  openFindingCount > 0
                    ? 'mt-0.5 text-xs text-status-warning'
                    : 'mt-0.5 text-xs text-status-success'
                }
              >
                {openFindingCount > 0
                  ? `${openFindingCount} open finding${openFindingCount === 1 ? '' : 's'}`
                  : lastCheckAt
                    ? 'No issues found'
                    : 'Run a check to begin'}
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              loading={checking}
              onClick={() => void runCheck()}
            >
              {!checking ? (
                <Play
                  className="h-3.5 w-3.5"
                  strokeWidth={2}
                  fill="currentColor"
                />
              ) : null}
              {checkPhase ? checkPhase : 'Run smart check'}
            </Button>
          </div>
        </div>
      </section>

      {/* Resource tiles */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <ResourceTile
          icon={Cpu}
          label="CPU"
          value={latest ? formatPercent(latest.cpuUsage) : '—'}
          detail={
            latest
              ? latest.cpuUsage < 50
                ? 'Normal'
                : latest.cpuUsage < 80
                  ? 'Elevated'
                  : 'High'
              : 'No sample'
          }
          detailTone={
            !latest
              ? 'muted'
              : latest.cpuUsage < 50
                ? 'success'
                : latest.cpuUsage < 80
                  ? 'warning'
                  : 'error'
          }
          series={cpuSeries}
          stroke="#57c1ff"
          onClick={go('health')}
        />
        <ResourceTile
          icon={MemoryStick}
          label="Memory"
          value={
            latest
              ? `${formatBytes(latest.memoryUsed)} / ${formatBytes(latest.memoryTotal)}`
              : '—'
          }
          detail={memPct !== null ? `${Math.round(memPct)}% used` : 'No sample'}
          detailTone={
            memPct === null
              ? 'muted'
              : memPct < 70
                ? 'success'
                : memPct < 90
                  ? 'warning'
                  : 'error'
          }
          series={memSeries}
          stroke="#57c1ff"
          onClick={go('health')}
        />
        <ResourceTile
          icon={HardDrive}
          label={
            latest?.diskName
              ? `Storage (${shortDrive(latest.diskName)})`
              : 'Storage'
          }
          value={diskUsedPct !== null ? `${Math.round(diskUsedPct)}%` : '—'}
          detail={
            diskFreePct !== null && latest
              ? `${Math.round(diskFreePct)}% free · ${formatBytes(latest.diskTotal - latest.diskUsed)}`
              : 'No sample'
          }
          detailTone={
            diskFreePct === null
              ? 'muted'
              : diskFreePct > 20
                ? 'success'
                : diskFreePct > 10
                  ? 'warning'
                  : 'error'
          }
          series={diskSeries}
          stroke="#59d499"
          onClick={go('storage')}
        />
        <ResourceTile
          icon={CircuitBoard}
          label="GPU"
          value={
            hwSampling
              ? '…'
              : gpuUsage !== null && Number.isFinite(gpuUsage)
                ? `${Math.round(gpuUsage)}%`
                : gpuName
                  ? 'Ready'
                  : '—'
          }
          detail={
            gpuName
              ? truncate(gpuName, 22)
              : hwSampling
                ? 'Reading sensors…'
                : 'Open Performance'
          }
          detailTone={gpuName ? 'muted' : 'muted'}
          series={[]}
          stroke="#a78bfa"
          onClick={go('hardware')}
        />
        <ResourceTile
          icon={Thermometer}
          label="Temperature"
          value={
            hwSampling
              ? '…'
              : displayTemp !== null && Number.isFinite(displayTemp)
                ? `${Math.round(displayTemp)}°C`
                : '—'
          }
          detail={
            displayTemp === null
              ? hwSampling
                ? 'Reading sensors…'
                : 'No sensor data'
              : displayTemp < 70
                ? 'Normal'
                : displayTemp < 85
                  ? 'Warm'
                  : 'Hot'
          }
          detailTone={
            displayTemp === null
              ? 'muted'
              : displayTemp < 70
                ? 'success'
                : displayTemp < 85
                  ? 'warning'
                  : 'error'
          }
          series={[]}
          stroke="#ffc533"
          onClick={go('hardware')}
        />
        <ResourceTile
          icon={Timer}
          label="Sample window"
          value={uptimeFromSamples(historyAsc) ?? '—'}
          detail={
            historyAsc.length >= 2
              ? 'Span of health samples'
              : 'Collect samples to measure'
          }
          detailTone="success"
          series={[]}
          stroke="#59d499"
          onClick={go('health')}
        />
      </div>

      {/* Findings | Quick actions */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
        <section className="panel flex min-h-0 flex-col">
          <div className="panel-header flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="panel-title">Findings</p>
              {openFindingCount > 0 ? (
                <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-status-error-bg px-1.5 text-2xs font-semibold text-status-error">
                  {openFindingCount}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={go('ai-detective')}
              className="flex items-center gap-0.5 text-xs font-medium text-text-secondary hover:text-text-primary"
            >
              View all findings
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="px-panel-x pb-2 text-2xs text-text-muted">
            Issues that need your attention
          </p>
          {findings.length === 0 ? (
            <p className="px-panel-x pb-5 text-sm text-text-muted">
              No open findings. Run a smart check to refresh intelligence.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {findings.map((f) => (
                <FindingRow
                  key={f.id}
                  finding={f}
                  onOpen={go(findingView(f))}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="panel flex min-h-0 flex-col">
          <div className="panel-header">
            <p className="panel-title">Quick actions</p>
            <p className="panel-subtitle">
              Run tools to optimize and protect your PC
            </p>
          </div>
          <ul className="divide-y divide-hairline">
            <QuickAction
              icon={Play}
              color="text-status-info"
              title="Smart Check"
              detail="Scan your system for issues and get recommendations"
              onClick={() => void runCheck()}
            />
            <QuickAction
              icon={Search}
              color="text-status-info"
              title="Deep Scan"
              detail="Thorough scan for hidden issues"
              onClick={go('security')}
            />
            <QuickAction
              icon={Brush}
              color="text-status-success"
              title="Cleanup"
              detail="Remove junk files and free up space"
              onClick={go('cleanup')}
            />
            <QuickAction
              icon={FileSpreadsheet}
              color="text-status-warning"
              title="Generate Report"
              detail="Create a detailed system report"
              onClick={go('system-report')}
            />
            <QuickAction
              icon={Bot}
              color="text-violet-400"
              title="AI Diagnose"
              detail="Ask AI about your system issues"
              badge="New"
              onClick={go('ai-detective')}
            />
          </ul>
        </section>
      </div>

      {/* System timeline — real events only, short labels */}
      <section className="panel">
        <div className="flex items-start justify-between gap-3 px-panel-x pb-1 pt-panel-y">
          <div>
            <p className="text-sm font-semibold text-text-primary cause-semibold">
              System timeline
            </p>
            <p className="mt-0.5 text-2xs text-text-muted">
              Recent critical events and changes
            </p>
          </div>
          <button
            type="button"
            onClick={go('timeline')}
            className="flex shrink-0 items-center gap-0.5 pt-0.5 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            View full timeline
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="px-panel-x pb-5 pt-5">
          <div className="relative">
            {/* Rail through vertical center of 36px icon circles */}
            <div
              className="pointer-events-none absolute left-[calc(12.5%-8px)] right-[calc(12.5%-8px)] top-[18px] h-px bg-hairline-soft"
              aria-hidden
            />
            <ol className="relative grid grid-cols-4 gap-0">
              {timelineItems.map((item) => {
                const Icon = item.icon;
                const toneBox =
                  item.tone === 'success'
                    ? 'border-status-success/40 bg-[#0f2a1f] text-status-success'
                    : item.tone === 'info'
                      ? 'border-status-info/40 bg-[#0f1c33] text-status-info'
                      : item.tone === 'warning'
                        ? 'border-status-warning/40 bg-[#2a2110] text-status-warning'
                        : 'border-hairline bg-[#151b26] text-text-secondary';
                return (
                  <li
                    key={item.id}
                    className="relative flex min-w-0 flex-col items-start px-2 first:pl-0 last:pr-0 sm:px-3"
                  >
                    <div
                      className={[
                        'relative z-[1] flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border',
                        toneBox,
                      ].join(' ')}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.75} />
                    </div>
                    <p className="mt-3 w-full truncate text-left text-[13px] font-semibold text-text-primary cause-semibold">
                      {item.title}
                    </p>
                    <p className="mt-0.5 w-full truncate text-left text-2xs text-text-muted">
                      {item.detail}
                    </p>
                    <p className="mt-1 w-full text-left text-2xs text-text-ash">
                      {item.when}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}

function findingView(f: IntelligenceFinding): View {
  if (f.engine === 'storage') return 'storage';
  if (f.engine === 'security') return 'security';
  if (f.engine === 'drivers') return 'drivers';
  if (f.engine === 'startup') return 'startup';
  return 'processes';
}

function FindingRow({
  finding,
  onOpen,
}: {
  finding: IntelligenceFinding;
  onOpen: () => void;
}) {
  const tone = severityTone(finding.severity);
  const badge =
    tone === 'error'
      ? 'bg-status-error-bg text-status-error'
      : tone === 'warning'
        ? 'bg-status-warning-bg text-status-warning'
        : tone === 'info'
          ? 'bg-status-info-bg text-status-info'
          : 'bg-surface-elevated text-text-muted';
  const dot =
    tone === 'error'
      ? 'bg-status-error'
      : tone === 'warning'
        ? 'bg-status-warning'
        : tone === 'info'
          ? 'bg-status-info'
          : 'bg-text-muted';

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="panel-row flex w-full items-start gap-3 text-left transition-colors hover:bg-surface-elevated/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/20"
      >
        <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${dot}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">
            {finding.title}
          </p>
          <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">
            {finding.summary}
          </p>
        </div>
        <span
          className={`mt-0.5 flex-shrink-0 rounded-md px-2 py-0.5 text-2xs font-semibold ${badge}`}
        >
          {severityBadgeLabel(finding.severity)}
        </span>
        <span className="mt-0.5 flex-shrink-0 text-2xs text-text-ash">
          {relativeTime(finding.createdAt)}
        </span>
        <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-text-muted" />
      </button>
    </li>
  );
}

function QuickAction({
  icon: Icon,
  color,
  title,
  detail,
  badge,
  onClick,
}: {
  icon: LucideIcon;
  color: string;
  title: string;
  detail: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="panel-row flex w-full items-center gap-3 text-left transition-colors hover:bg-surface-elevated/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/20"
      >
        <span
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-control border border-hairline bg-surface-elevated ${color}`}
        >
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
            {title}
            {badge ? (
              <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-2xs font-semibold text-violet-300">
                {badge}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">
            {detail}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-muted" />
      </button>
    </li>
  );
}

function ResourceTile({
  icon: Icon,
  label,
  value,
  detail,
  detailTone,
  series,
  stroke,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  detailTone: 'success' | 'warning' | 'error' | 'muted';
  series: number[];
  stroke: string;
  onClick: () => void;
}) {
  const detailClass =
    detailTone === 'success'
      ? 'text-status-success'
      : detailTone === 'warning'
        ? 'text-status-warning'
        : detailTone === 'error'
          ? 'text-status-error'
          : 'text-text-muted';

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-card border border-hairline bg-surface-card px-panel-x py-panel-y text-left transition-colors hover:border-hairline-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
    >
      <div className="flex items-center gap-1.5 text-text-muted">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span className="text-2xs font-semibold uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="mt-2 truncate text-sm font-semibold tabular-nums text-text-primary">
        {value}
      </p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className={`text-2xs ${detailClass}`}>{detail}</p>
        {series.length >= 2 ? (
          <MiniSparkline values={series} stroke={stroke} className="h-6 w-14" />
        ) : null}
      </div>
    </button>
  );
}

function HealthTrendChart({
  samples,
  series,
}: {
  samples: HealthSample[];
  series: number[];
}) {
  const w = 360;
  const h = 96;
  const pad = 8;
  const values =
    series.length >= 2
      ? series
      : series.length === 1
        ? [series[0], series[0]]
        : [50, 55, 52, 60, 58, 65, 70];

  const min = 0;
  const max = 100;
  const n = values.length;
  const pts = values.map((v, i) => {
    const x = pad + (i / Math.max(n - 1, 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`)
    .join(' ');
  const area = `${line} L${pts[pts.length - 1][0]},${h - pad} L${pts[0][0]},${h - pad} Z`;

  const labels =
    samples.length >= 2
      ? [
          shortDay(samples[0].capturedAt),
          shortDay(samples[Math.floor(samples.length / 2)].capturedAt),
          'Today',
        ]
      : ['', '', 'Today'];

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-24 w-full"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="healthFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#59d499" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#59d499" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[25, 50, 75].map((g) => {
          const y = h - pad - ((g - min) / (max - min)) * (h - pad * 2);
          return (
            <line
              key={g}
              x1={pad}
              x2={w - pad}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
          );
        })}
        <path d={area} fill="url(#healthFill)" />
        <path
          d={line}
          fill="none"
          stroke="#59d499"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pts.length > 0 ? (
          <circle
            cx={pts[pts.length - 1][0]}
            cy={pts[pts.length - 1][1]}
            r="3.5"
            fill="#59d499"
          />
        ) : null}
      </svg>
      <div className="mt-1 flex justify-between px-1 text-2xs text-text-ash">
        <span>{labels[0]}</span>
        <span>{labels[1]}</span>
        <span>{labels[2]}</span>
      </div>
    </div>
  );
}

function MiniSparkline({
  values,
  stroke,
  className,
}: {
  values: number[];
  stroke: string;
  className?: string;
}) {
  const w = 56;
  const h = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * w;
      const y = h - ((v - min) / span) * (h - 2) - 1;
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function shortDay(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

function shortDrive(name: string): string {
  const m = name.match(/([A-Za-z]:)/);
  return m ? m[1] : name.slice(0, 8);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

/** Span between oldest and newest health samples (not OS boot uptime). */
function uptimeFromSamples(samples: HealthSample[]): string | null {
  if (samples.length < 2) return null;
  const times = samples
    .map((s) => new Date(s.capturedAt).getTime())
    .filter(Number.isFinite);
  if (times.length < 2) return null;
  const span = Math.max(...times) - Math.min(...times);
  if (span < 60_000) return '<1h';
  const hours = Math.floor(span / 3_600_000);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return `${days}d ${rem}h`;
}

function extractHardwareMetrics(hardware: HardwareSample | null): {
  gpuUsage: number | null;
  cpuTemp: number | null;
  gpuTemp: number | null;
  gpuName: string | null;
} {
  if (!hardware) {
    return { gpuUsage: null, cpuTemp: null, gpuTemp: null, gpuName: null };
  }
  let gpuUsage = hardware.gpuUsagePct;
  let cpuTemp = hardware.cpuTempC;
  let gpuTemp = hardware.gpuTempC;
  const sensors = hardware.sensors ?? [];
  for (const s of sensors) {
    const name = `${s.name} ${s.category}`.toLowerCase();
    if (
      gpuUsage == null &&
      (name.includes('gpu load') ||
        (name.includes('gpu') && s.unit.includes('%')))
    ) {
      gpuUsage = s.value;
    }
    if (
      cpuTemp == null &&
      (name.includes('cpu') || name.includes('package')) &&
      (s.unit.includes('C') || s.unit.includes('°'))
    ) {
      cpuTemp = s.value;
    }
    if (
      gpuTemp == null &&
      name.includes('gpu') &&
      (s.unit.includes('C') || s.unit.includes('°'))
    ) {
      gpuTemp = s.value;
    }
  }
  return {
    gpuUsage: gpuUsage ?? null,
    cpuTemp: cpuTemp ?? null,
    gpuTemp: gpuTemp ?? null,
    gpuName: hardware.gpuName ?? null,
  };
}

type TimelineItem = {
  id: string;
  title: string;
  detail: string;
  when: string;
  tone: 'success' | 'info' | 'warning' | 'neutral';
  icon: LucideIcon;
};

/**
 * Overview strip built only from real timeline / health / crash signals.
 * Never invents product names, free-space figures, or relative dates.
 */
function buildTimelineItems(
  events: TimelineEvent[],
  latest: HealthSample | null,
  crashCount: number,
  snapshotCount: number,
): TimelineItem[] {
  const softwareEv = events.find((e) => {
    const t = blob(e);
    return (
      t.includes('software') ||
      t.includes('install') ||
      t.includes('update') ||
      t.includes('windows')
    );
  });
  const driverEv = events.find((e) => {
    const t = blob(e);
    return (
      t.includes('driver') ||
      t.includes('gpu') ||
      t.includes('nvidia') ||
      t.includes('amd')
    );
  });
  const configEv = events.find((e) => {
    const t = blob(e);
    return (
      t.includes('config') ||
      t.includes('startup') ||
      t.includes('service') ||
      t.includes('task') ||
      t.includes('clean')
    );
  });

  const items: TimelineItem[] = [];

  if (softwareEv) {
    items.push({
      id: softwareEv.id,
      title: 'Software change',
      detail: humanDetail(softwareEv, 'Change detected'),
      when: relativeTime(softwareEv.occurredAt),
      tone: 'neutral',
      icon: CloudDownload,
    });
  } else if (snapshotCount > 0) {
    items.push({
      id: 'tl-baseline',
      title: 'Baseline',
      detail: `${snapshotCount} snapshot${snapshotCount === 1 ? '' : 's'} on device`,
      when: relativeTime(latest?.capturedAt),
      tone: 'neutral',
      icon: CloudDownload,
    });
  }

  items.push({
    id: 'tl-check',
    title: 'Health check',
    detail: latest
      ? crashCount > 0
        ? `${crashCount} stability note(s)`
        : `Score ${Math.round(latest.healthScore)}`
      : 'Not sampled yet',
    when: relativeTime(latest?.capturedAt),
    tone: latest ? 'success' : 'neutral',
    icon: Activity,
  });

  if (driverEv) {
    items.push({
      id: driverEv.id,
      title: 'Driver change',
      detail: humanDetail(driverEv, 'Driver change detected'),
      when: relativeTime(driverEv.occurredAt),
      tone: 'info',
      icon: Wrench,
    });
  }

  if (configEv) {
    items.push({
      id: configEv.id,
      title: 'Config change',
      detail: humanDetail(configEv, 'Configuration changed'),
      when: relativeTime(configEv.occurredAt),
      tone: 'warning',
      icon: Brush,
    });
  }

  // Prefer up to 4 real nodes; pad only with honest empty slots when sparse.
  while (items.length < 4) {
    items.push({
      id: `tl-empty-${items.length}`,
      title: 'No event',
      detail: 'Capture a baseline or wait for changes',
      when: '—',
      tone: 'neutral',
      icon: Activity,
    });
  }

  return items.slice(0, 4);
}

function blob(e: TimelineEvent): string {
  return `${e.eventType} ${e.category} ${e.title} ${e.detail ?? ''}`.toLowerCase();
}

/** Short human copy only — never raw registry / task paths. */
function humanDetail(e: TimelineEvent, fallback: string): string {
  const raw = (e.detail ?? e.title ?? '').trim();
  if (!raw) return fallback;
  // Drop GUID/path noise
  if (
    raw.includes('\\') ||
    raw.includes('{') ||
    raw.length > 42 ||
    /[0-9a-f]{8}-[0-9a-f]{4}/i.test(raw)
  ) {
    const t = blob(e);
    if (t.includes('config_added') || t.includes('added'))
      return 'Configuration changed';
    if (t.includes('config_removed') || t.includes('removed'))
      return 'Item removed';
    if (t.includes('software_install') || t.includes('install'))
      return 'Successfully installed';
    if (t.includes('software_update') || t.includes('update'))
      return 'Package updated';
    if (t.includes('driver')) return 'Driver package changed';
    return fallback;
  }
  return raw.length > 36 ? `${raw.slice(0, 34)}…` : raw;
}
