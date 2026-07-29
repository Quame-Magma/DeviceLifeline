import { useEffect, useMemo } from 'react';
import { ChevronRight, Leaf, Sparkles } from 'lucide-react';
import { useHealth } from '../hooks/use-health';
import { formatPercent, formatTimestamp } from '../lib/format';
import { usePaginatedItems } from '../hooks/use-pagination';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Pagination } from '../components/common/Pagination';
import { Spinner } from '../components/common/Spinner';
import { HealthScoreGauge } from '../components/health/HealthScoreGauge';
import { ResourceUsageBars } from '../components/health/ResourceUsageBars';
import { HealthSampleList } from '../components/health/HealthSampleList';
import { HealthAlertList } from '../components/health/HealthAlertList';
import {
  buildHealthInsight,
  diskPct,
  memoryPct,
} from '../components/health/insights';
import { PageShell } from '../components/layout/PageShell';
import type { View } from '../components/layout/Sidebar';
import type { HealthAlert, HealthSample } from '../types/device.types';

interface HealthProps {
  onNavigate?: (view: View) => void;
}

/**
 * Health page — redesigned to match ChatGPT mock:
 * hero score + icon bars, sparkline metric tiles, score-pill samples, alert card.
 */
export function Health({ onNavigate }: HealthProps) {
  const {
    latest,
    samples,
    alerts,
    sampling,
    loading,
    error,
    loadHealth,
    collectSample,
    acknowledge,
  } = useHealth();

  const { pageItems: pageSamples, pagination: samplePages } =
    usePaginatedItems(samples);
  const { pageItems: pageAlerts, pagination: alertPages } =
    usePaginatedItems(alerts);

  useEffect(() => {
    void loadHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chronological series for sparklines (oldest → newest)
  const historyAsc = useMemo(
    () => [...samples].reverse().slice(-24),
    [samples],
  );

  const scoreSeries = useMemo(
    () => historyAsc.map((s) => s.healthScore),
    [historyAsc],
  );
  const cpuSeries = useMemo(
    () => historyAsc.map((s) => s.cpuUsage),
    [historyAsc],
  );
  const memSeries = useMemo(
    () => historyAsc.map((s) => memoryPct(s)),
    [historyAsc],
  );
  const diskSeries = useMemo(
    () => historyAsc.map((s) => diskPct(s)),
    [historyAsc],
  );

  return (
    <PageShell
      title="Health"
      description="Monitor your system's vital signs and overall health."
      actions={
        <Button
          variant="primary"
          size="sm"
          loading={sampling}
          onClick={() => void collectSample()}
        >
          {!sampling ? (
            <Leaf className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          ) : null}
          {sampling ? 'Sampling…' : 'Sample now'}
        </Button>
      }
    >
      {error ? (
        <AlertBanner
          title="Could not load health"
          message={error}
          onRetry={() => void loadHealth()}
        />
      ) : null}

      {loading && latest === null ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading health…" />
        </div>
      ) : latest === null ? (
        <EmptyState
          heading="No health data yet"
          body="Take a sample to measure CPU, memory, and disk pressure."
          action={
            <Button
              variant="primary"
              size="sm"
              loading={sampling}
              onClick={() => void collectSample()}
            >
              Sample now
            </Button>
          }
        />
      ) : (
        <HealthBody
          latest={latest}
          samples={samples}
          pageSamples={pageSamples}
          samplePages={samplePages}
          scoreSeries={scoreSeries}
          cpuSeries={cpuSeries}
          memSeries={memSeries}
          diskSeries={diskSeries}
          alerts={alerts}
          pageAlerts={pageAlerts}
          alertPages={alertPages}
          acknowledge={acknowledge}
          onNavigate={onNavigate}
        />
      )}
    </PageShell>
  );
}

function HealthBody({
  latest,
  samples,
  pageSamples,
  samplePages,
  scoreSeries,
  cpuSeries,
  memSeries,
  diskSeries,
  alerts,
  pageAlerts,
  alertPages,
  acknowledge,
  onNavigate,
}: {
  latest: HealthSample;
  samples: HealthSample[];
  pageSamples: HealthSample[];
  samplePages: ReturnType<typeof usePaginatedItems<HealthSample>>['pagination'];
  scoreSeries: number[];
  cpuSeries: number[];
  memSeries: number[];
  diskSeries: number[];
  alerts: HealthAlert[];
  pageAlerts: HealthAlert[];
  alertPages: ReturnType<typeof usePaginatedItems<HealthAlert>>['pagination'];
  acknowledge: (id: string) => void | Promise<void>;
  onNavigate?: (view: View) => void;
}) {
  const insight = buildHealthInsight(latest, alerts);
  const openCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <>
      {/* Hero */}
      <section className="panel overflow-hidden">
        <div className="grid gap-6 p-5 lg:grid-cols-[200px_minmax(0,1fr)] lg:items-center lg:gap-8 lg:p-6">
          <HealthScoreGauge score={latest.healthScore} />

          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
              Status · {formatTimestamp(latest.capturedAt)}
            </p>
            <p className="mt-1.5 text-sm font-semibold leading-snug text-text-primary cause-semibold">
              {insight.summary}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">
              {insight.primaryConcern}
            </p>

            <div className="mt-5">
              <ResourceUsageBars sample={latest} />
            </div>

            <div className="mt-5 flex items-start gap-2 rounded-control border border-hairline bg-surface-elevated/70 px-3.5 py-2.5">
              <Sparkles
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent"
                strokeWidth={1.75}
                aria-hidden
              />
              <p className="text-xs leading-relaxed text-text-secondary">
                <span className="font-semibold text-text-primary">Next: </span>
                {insight.recommendedAction}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Sparkline metric tiles — Status / CPU / Memory / Disk */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MetricSparkTile
          label="Status"
          value={insight.status}
          series={scoreSeries}
          stroke="#ff6b6b"
        />
        <MetricSparkTile
          label="CPU"
          value={formatPercent(latest.cpuUsage)}
          series={cpuSeries}
          stroke="#3dd68c"
        />
        <MetricSparkTile
          label="Memory"
          value={formatPercent(memoryPct(latest))}
          series={memSeries}
          stroke="#f5b942"
        />
        <MetricSparkTile
          label="Disk"
          value={formatPercent(diskPct(latest))}
          series={diskSeries}
          stroke="#ff6b6b"
        />
      </div>

      {/* Recent samples */}
      <section className="panel">
        <div className="panel-header">
          <p className="panel-title">Recent samples</p>
          <p className="panel-subtitle">
            {samples.length} sample{samples.length === 1 ? '' : 's'} collected
            on this device
          </p>
        </div>
        <HealthSampleList samples={pageSamples} />
        <Pagination pagination={samplePages} itemLabel="samples" />
      </section>

      {/* Open alerts */}
      {alerts.length > 0 ? (
        <section className="panel">
          <div className="panel-header flex items-center justify-between gap-3">
            <div>
              <p className="panel-title">Open alerts</p>
              <p className="panel-subtitle">
                {openCount > 0
                  ? `${openCount} need attention`
                  : `${alerts.length} recorded`}
              </p>
            </div>
            {alerts.length > 0 ? (
              <span className="text-2xs text-text-muted">
                {alerts.length} total · {openCount} open
              </span>
            ) : null}
          </div>
          <div className="panel-body space-y-3">
            <HealthAlertList
              alerts={pageAlerts}
              onAcknowledge={(id) => void acknowledge(id)}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
              <p className="flex items-center gap-1.5 text-2xs text-status-success">
                <span
                  className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-status-success/20 text-[10px] font-bold text-status-success"
                  aria-hidden
                >
                  i
                </span>
                Tip: Address disk space first for the biggest performance
                improvement.
              </p>
              {onNavigate ? (
                <button
                  type="button"
                  onClick={() => onNavigate('cleanup')}
                  className="flex items-center gap-0.5 text-xs font-medium text-text-secondary hover:text-text-primary"
                >
                  Get cleanup recommendations
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>
          <Pagination pagination={alertPages} itemLabel="alerts" />
        </section>
      ) : null}
    </>
  );
}

function MetricSparkTile({
  label,
  value,
  series,
  stroke,
}: {
  label: string;
  value: string;
  series: number[];
  stroke: string;
}) {
  return (
    <div className="rounded-card border border-hairline bg-surface-card px-panel-x py-panel-y shadow-card">
      <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <p className="text-lg font-semibold tabular-nums tracking-tight text-text-primary cause-semibold">
          {value}
        </p>
        {series.length >= 2 ? (
          <MiniSparkline values={series} stroke={stroke} className="h-7 w-16" />
        ) : null}
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
  const w = 64;
  const h = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
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
