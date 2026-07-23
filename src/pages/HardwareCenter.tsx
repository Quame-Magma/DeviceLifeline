import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircuitBoard,
  Cpu,
  ExternalLink,
  Gauge,
  HardDrive,
  Info,
  MemoryStick,
  RefreshCw,
  Thermometer,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useHardware } from '../hooks/use-hardware';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { MiniSparkline } from '../components/common/MiniSparkline';
import { Spinner } from '../components/common/Spinner';
import { PageShell } from '../components/layout/PageShell';
import { formatBytes, formatTimestamp } from '../lib/format';
import type {
  DiskHealthSummary,
  HardwareSample,
  SensorReading,
  SmartAttribute,
  SmartReading,
} from '../types/device.types';

const SENSOR_PREVIEW = 5;
const SMART_PREVIEW = 5;

const STROKE = {
  blue: '#5b9dff',
  purple: '#a78bfa',
  green: '#3dd68c',
  amber: '#f5b942',
  cyan: '#22d3ee',
} as const;

function formatTemp(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${Math.round(value)}°C`;
}

function formatMhz(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${Math.round(value)} MHz`;
}

function formatOptionalPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${Math.round(value)}%`;
}

/** Split amount / unit so tables can align numbers in a fixed column. */
function splitSensorValue(
  value: number,
  unit: string | null | undefined,
): { amount: string; unitLabel: string } {
  const u = (unit ?? '').trim();
  if (u === '%' || u === 'percent') {
    return { amount: Number(value.toFixed(1)).toString(), unitLabel: '%' };
  }
  if (u === '°C' || u === 'C' || u === 'celsius' || u === 'Celsius') {
    return { amount: String(Math.round(value)), unitLabel: '°C' };
  }
  if (u === 'MHz' || u.toLowerCase() === 'mhz') {
    return { amount: String(Math.round(value)), unitLabel: 'MHz' };
  }
  if (Math.abs(value) > 0 && Math.abs(value) < 1) {
    return { amount: value.toFixed(2), unitLabel: u };
  }
  if (Number.isInteger(value)) {
    return { amount: String(value), unitLabel: u };
  }
  return { amount: String(Number(value.toFixed(2))), unitLabel: u };
}

function formatCategoryLabel(category: string): string {
  const c = category.trim().toLowerCase();
  const map: Record<string, string> = {
    cpu: 'CPU',
    gpu: 'GPU',
    disk: 'Disk',
    fan: 'Fan',
    thermal: 'Thermal',
    power: 'Power',
    memory: 'Memory',
    other: 'Other',
  };
  return map[c] ?? category.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function healthScoreTone(score: number): 'success' | 'warning' | 'error' {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'error';
}

function healthScoreLabel(score: number): string {
  if (score >= 80) return 'Good';
  if (score >= 50) return 'Caution';
  return 'At risk';
}

function tempStatus(value: number | null): {
  label: string;
  tone: 'success' | 'warning' | 'error' | 'muted';
} {
  if (value === null || !Number.isFinite(value)) {
    return { label: 'No data', tone: 'muted' };
  }
  if (value < 70) return { label: 'Normal', tone: 'success' };
  if (value < 85) return { label: 'Warm', tone: 'warning' };
  return { label: 'Hot', tone: 'error' };
}

function gpuUsageStatus(value: number | null): {
  label: string;
  tone: 'success' | 'warning' | 'error' | 'muted';
} {
  if (value === null || !Number.isFinite(value)) {
    return { label: 'No data', tone: 'muted' };
  }
  if (value < 5) return { label: 'Idle', tone: 'success' };
  if (value < 40) return { label: 'Light', tone: 'success' };
  if (value < 75) return { label: 'Active', tone: 'warning' };
  return { label: 'High', tone: 'error' };
}

function smartStatusClass(status: string | null | undefined): string {
  if (!status) return 'text-text-secondary';
  const normalized = status.toLowerCase();
  if (
    normalized.includes('ok') ||
    normalized.includes('good') ||
    normalized.includes('pass') ||
    normalized.includes('healthy')
  ) {
    return 'text-status-success';
  }
  if (
    normalized.includes('warn') ||
    normalized.includes('caution') ||
    normalized.includes('degraded')
  ) {
    return 'text-status-warning';
  }
  if (
    normalized.includes('fail') ||
    normalized.includes('critical') ||
    normalized.includes('bad')
  ) {
    return 'text-status-error';
  }
  return 'text-text-secondary';
}

function isHealthyStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const n = status.toLowerCase();
  return (
    n.includes('ok') ||
    n.includes('good') ||
    n.includes('pass') ||
    n.includes('healthy')
  );
}

function sensorIcon(category: string, name: string): LucideIcon {
  const key = `${category} ${name}`.toLowerCase();
  if (key.includes('clock') || key.includes('freq')) return Gauge;
  if (key.includes('memory') || key.includes('ram')) return MemoryStick;
  if (key.includes('disk') || key.includes('storage') || key.includes('drive')) {
    return HardDrive;
  }
  if (key.includes('gpu') || key.includes('vram') || key.includes('graphics')) {
    return CircuitBoard;
  }
  if (key.includes('temp') || key.includes('thermal')) return Thermometer;
  if (key.includes('cpu')) return Cpu;
  return Activity;
}

function sensorStroke(category: string, unit: string): string {
  const cat = category.toLowerCase();
  const u = unit.toLowerCase();
  if (u.includes('%') || cat.includes('memory')) return STROKE.amber;
  if (cat.includes('disk') || cat.includes('storage')) return STROKE.green;
  if (cat.includes('gpu')) return STROKE.cyan;
  if (u.includes('mhz') || cat.includes('clock')) return STROKE.purple;
  return STROKE.blue;
}

function finiteSeries(values: Array<number | null | undefined>): number[] {
  return values.filter(
    (v): v is number => v !== null && v !== undefined && Number.isFinite(v),
  );
}

function isCelsiusSensor(unit: string): boolean {
  const u = unit.trim().toLowerCase();
  return u === '°c' || u === 'c' || u === 'celsius';
}

function bestSensorTemp(
  sample: HardwareSample,
  hints: string[],
): number | null {
  const sensors = sample.sensors ?? [];
  let best: number | null = null;
  for (const s of sensors) {
    if (!isCelsiusSensor(s.unit)) continue;
    if (!Number.isFinite(s.value) || s.value <= 0 || s.value > 150) continue;
    const hay = `${s.category} ${s.name} ${s.source}`.toLowerCase();
    if (
      hay.includes('disk') ||
      hay.includes('ssd') ||
      hay.includes('hdd') ||
      hay.includes('nvme')
    ) {
      continue;
    }
    if (!hints.some((h) => hay.includes(h))) continue;
    best = best === null ? s.value : Math.max(best, s.value);
  }
  return best;
}

/** Top-level field, else CPU-ish sensor, else thermal zone. */
function effectiveCpuTemp(sample: HardwareSample): number | null {
  if (sample.cpuTempC !== null && Number.isFinite(sample.cpuTempC)) {
    return sample.cpuTempC;
  }
  return (
    bestSensorTemp(sample, ['cpu', 'package', 'tctl', 'tdie', 'core']) ??
    bestSensorTemp(sample, ['thermal', 'thm', 'acpi', 'zone'])
  );
}

/** Top-level field, else GPU-named sensor. */
function effectiveGpuTemp(sample: HardwareSample): number | null {
  if (sample.gpuTempC !== null && Number.isFinite(sample.gpuTempC)) {
    return sample.gpuTempC;
  }
  return bestSensorTemp(sample, [
    'gpu',
    'nvidia',
    'geforce',
    'radeon',
    'amd',
    'graphics',
  ]);
}

function seriesMinMax(series: number[]): { min: number | null; max: number | null } {
  if (series.length === 0) return { min: null, max: null };
  return { min: Math.min(...series), max: Math.max(...series) };
}

/**
 * Performance — ChatGPT mock layout:
 * spark metric tiles → sensors | SMART disks → disk health cards → tip bar.
 */
export function HardwareCenter() {
  const {
    latest,
    samples,
    diskHealth,
    loading,
    sampling,
    error,
    loadHardware,
    collectSample,
    loadDiskHealth,
  } = useHardware();

  useEffect(() => {
    void loadHardware();
    void loadDiskHealth();
  }, [loadHardware, loadDiskHealth]);

  const handleSample = () => {
    void collectSample().then(() => {
      void loadDiskHealth();
    });
  };

  // Chronological (oldest → newest) for sparklines
  const historyAsc = useMemo(() => [...samples].reverse().slice(-24), [samples]);

  const cpuTempSeries = useMemo(
    () => finiteSeries(historyAsc.map((s) => effectiveCpuTemp(s))),
    [historyAsc],
  );
  const cpuClockSeries = useMemo(
    () => finiteSeries(historyAsc.map((s) => s.cpuClockMhz)),
    [historyAsc],
  );
  const gpuTempSeries = useMemo(
    () => finiteSeries(historyAsc.map((s) => effectiveGpuTemp(s))),
    [historyAsc],
  );
  const gpuUsageSeries = useMemo(
    () => finiteSeries(historyAsc.map((s) => s.gpuUsagePct)),
    [historyAsc],
  );

  const cpuTempRange = seriesMinMax(cpuTempSeries);
  const cpuClockRange = seriesMinMax(cpuClockSeries);

  const sensorHistory = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const sample of historyAsc) {
      for (const sensor of sample.sensors ?? []) {
        const key = `${sensor.category}::${sensor.name}`;
        const arr = map.get(key) ?? [];
        if (Number.isFinite(sensor.value)) {
          arr.push(sensor.value);
        }
        map.set(key, arr);
      }
    }
    return map;
  }, [historyAsc]);

  return (
    <PageShell
      title="Performance"
      description="Sensors, clocks, GPU load, and disk health."
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            loading={loading && !sampling}
            onClick={() => void loadDiskHealth()}
          >
            <HardDrive className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Disk health
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={sampling}
            onClick={handleSample}
          >
            {!sampling ? (
              <Activity className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            ) : null}
            {sampling ? 'Sampling…' : 'Sample hardware'}
          </Button>
        </>
      }
    >
      {error ? (
        <AlertBanner title="Hardware sample unavailable" message={error} />
      ) : null}

      {loading && !latest ? (
        <div className="flex items-center justify-center py-16">
          <Spinner label="Loading hardware…" />
        </div>
      ) : !latest ? (
        <EmptyState
          icon={<Cpu className="h-8 w-8" strokeWidth={1.75} />}
          heading="No hardware sample yet"
          body="Capture a sample to read temperatures, GPU metrics, and SMART data."
          action={
            <Button
              variant="primary"
              size="sm"
              loading={sampling}
              onClick={handleSample}
            >
              Sample hardware
            </Button>
          }
        />
      ) : (
        <PerformanceBody
          latest={latest}
          diskHealth={diskHealth}
          loading={loading}
          cpuTempSeries={cpuTempSeries}
          cpuClockSeries={cpuClockSeries}
          gpuTempSeries={gpuTempSeries}
          gpuUsageSeries={gpuUsageSeries}
          cpuTempRange={cpuTempRange}
          cpuClockRange={cpuClockRange}
          sensorHistory={sensorHistory}
          onRefreshDiskHealth={() => void loadDiskHealth()}
        />
      )}
    </PageShell>
  );
}

function PerformanceBody({
  latest,
  diskHealth,
  loading,
  cpuTempSeries,
  cpuClockSeries,
  gpuTempSeries,
  gpuUsageSeries,
  cpuTempRange,
  cpuClockRange,
  sensorHistory,
  onRefreshDiskHealth,
}: {
  latest: HardwareSample;
  diskHealth: DiskHealthSummary[];
  loading: boolean;
  cpuTempSeries: number[];
  cpuClockSeries: number[];
  gpuTempSeries: number[];
  gpuUsageSeries: number[];
  cpuTempRange: { min: number | null; max: number | null };
  cpuClockRange: { min: number | null; max: number | null };
  sensorHistory: Map<string, number[]>;
  onRefreshDiskHealth: () => void;
}) {
  const resolvedCpuTemp = effectiveCpuTemp(latest);
  const resolvedGpuTemp = effectiveGpuTemp(latest);
  const cpuTemp = tempStatus(resolvedCpuTemp);
  const gpuTemp = tempStatus(resolvedGpuTemp);
  const gpuUsage = gpuUsageStatus(latest.gpuUsagePct);

  const vramHint = `VRAM ${
    latest.gpuVramUsed !== null ? formatBytes(latest.gpuVramUsed) : '—'
  } / ${
    latest.gpuVramTotal !== null ? formatBytes(latest.gpuVramTotal) : '—'
  }`;

  return (
    <>
      {/* Hero metric tiles with sparklines */}
      <div
        className="grid grid-cols-2 gap-2 xl:grid-cols-4"

      >
        <MetricSparkCard
          icon={Thermometer}
          label="CPU Temperature"
          value={formatTemp(resolvedCpuTemp)}
          status={cpuTemp.label}
          statusTone={cpuTemp.tone}
          footer={
            cpuTempRange.min !== null && cpuTempRange.max !== null
              ? `Min ${Math.round(cpuTempRange.min)}°C  ·  Max ${Math.round(cpuTempRange.max)}°C`
              : resolvedCpuTemp === null
                ? 'Sample again — thermal sensors need a live read'
                : 'No history yet'
          }
          series={cpuTempSeries}
          stroke={STROKE.blue}
        />
        <MetricSparkCard
          icon={Gauge}
          label="CPU Clock"
          value={formatMhz(latest.cpuClockMhz)}
          status="Current frequency"
          statusTone="muted"
          footer={
            cpuClockRange.min !== null && cpuClockRange.max !== null
              ? `Base ${Math.round(cpuClockRange.min)} MHz  ·  Max ${Math.round(cpuClockRange.max)} MHz`
              : 'No history yet'
          }
          series={cpuClockSeries}
          stroke={STROKE.purple}
        />
        <MetricSparkCard
          icon={Thermometer}
          label="GPU Temperature"
          value={formatTemp(resolvedGpuTemp)}
          status={gpuTemp.label}
          statusTone={gpuTemp.tone}
          footer={
            latest.gpuName?.trim() ||
            (resolvedGpuTemp === null
              ? 'iGPU/no sensor — install LHM or use NVIDIA GPU'
              : 'GPU')
          }
          series={gpuTempSeries}
          stroke={STROKE.blue}
        />
        <MetricSparkCard
          icon={Activity}
          label="GPU Usage"
          value={
            latest.gpuUsagePct === null || !Number.isFinite(latest.gpuUsagePct)
              ? '—'
              : `${Math.round(latest.gpuUsagePct)}%`
          }
          status={gpuUsage.label}
          statusTone={gpuUsage.tone}
          footer={vramHint}
          series={gpuUsageSeries}
          stroke={STROKE.green}
        />
      </div>

      {/* Sensors | SMART disks */}
      <div className="grid gap-3 lg:grid-cols-2">
        <SensorsPanel
          sensors={latest.sensors ?? []}
          capturedAt={latest.capturedAt}
          sensorHistory={sensorHistory}
        />
        <SmartDisksPanel readings={latest.smart} diskHealth={diskHealth} />
      </div>

      {/* Disk health scored list */}
      <DiskHealthSection
        disks={mergeDiskHealthWithSmart(diskHealth, latest.smart)}
        loading={loading}
        onRefresh={onRefreshDiskHealth}
      />

      {/* Tip bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hairline bg-surface-card px-panel-x py-3 shadow-card">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-text-secondary">
          <Info
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent"
            strokeWidth={1.75}
            aria-hidden
          />
          <span>
            <span className="font-semibold text-text-primary">Tip: </span>
            Keep your drive temperatures under 50°C for optimal performance and
            longevity.
          </span>
        </p>
        <a
          href="https://www.seagate.com/support/kb/hard-drive-temperature-guidelines/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          Learn more
          <ExternalLink className="h-3 w-3" strokeWidth={1.75} aria-hidden />
        </a>
      </div>
    </>
  );
}

function MetricSparkCard({
  icon: Icon,
  label,
  value,
  status,
  statusTone,
  footer,
  series,
  stroke,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  status: string;
  statusTone: 'success' | 'warning' | 'error' | 'muted';
  footer: string;
  series: number[];
  stroke: string;
}) {
  const statusClass =
    statusTone === 'success'
      ? 'text-status-success'
      : statusTone === 'warning'
        ? 'text-status-warning'
        : statusTone === 'error'
          ? 'text-status-error'
          : 'text-text-muted';

  return (
    <div className="rounded-card border border-hairline bg-surface-card px-panel-x py-panel-y shadow-card">
      <div className="flex items-center gap-1.5 text-text-muted">
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
        <p className="text-2xs font-semibold uppercase tracking-wide">{label}</p>
      </div>

      <div className="mt-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl font-semibold tabular-nums tracking-tight text-text-primary cause-semibold">
            {value}
          </p>
          <p className={`mt-1 text-xs font-medium ${statusClass}`}>{status}</p>
        </div>
        {series.length >= 2 ? (
          <MiniSparkline
            values={series}
            stroke={stroke}
            className="mt-1 h-8 w-[4.5rem] shrink-0 opacity-90"
            width={72}
            height={32}
          />
        ) : null}
      </div>

      <p className="mt-3 truncate border-t border-hairline pt-2.5 text-2xs text-text-muted">
        {footer}
      </p>
    </div>
  );
}

function SensorsPanel({
  sensors,
  capturedAt,
  sensorHistory,
}: {
  sensors: SensorReading[];
  capturedAt: string;
  sensorHistory: Map<string, number[]>;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? sensors : sensors.slice(0, SENSOR_PREVIEW);
  const remaining = Math.max(0, sensors.length - SENSOR_PREVIEW);

  return (
    <section className="panel min-w-0">
      <div className="panel-header flex items-center justify-between gap-2">
        <div>
          <p className="panel-title">Sensors</p>
          <p className="panel-subtitle">
            Captured {formatTimestamp(capturedAt)}
          </p>
        </div>
        {sensors.length > SENSOR_PREVIEW ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-control border border-hairline px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
          >
            {expanded ? 'Show less' : 'View all'}
          </button>
        ) : null}
      </div>

      {sensors.length === 0 ? (
        <p className="panel-body text-sm text-text-muted">
          No expanded sensor readings in this sample.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="data-table table-fixed">
              <colgroup>
                <col className="w-[34%]" />
                <col className="w-[12%]" />
                <col className="w-[18%]" />
                <col className="w-[22%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Sensor</th>
                  <th scope="col">Category</th>
                  <th scope="col">Value</th>
                  <th scope="col">Source</th>
                  <th scope="col">Trend</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => {
                  const key = `${s.category}::${s.name}`;
                  const series = sensorHistory.get(key) ?? [];
                  const Icon = sensorIcon(s.category, s.name);
                  const split = Number.isFinite(s.value)
                    ? splitSensorValue(s.value, s.unit)
                    : null;
                  return (
                    <tr key={key}>
                      <td className="align-middle">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-hairline bg-surface-elevated text-text-muted">
                            <Icon
                              className="h-3 w-3"
                              strokeWidth={1.75}
                              aria-hidden
                            />
                          </span>
                          <span className="truncate font-medium text-text-primary">
                            {s.name}
                          </span>
                        </div>
                      </td>
                      <td className="align-middle text-xs text-text-secondary">
                        {formatCategoryLabel(s.category)}
                      </td>
                      <td className="align-middle">
                        {split ? (
                          <span className="inline-flex items-baseline gap-1.5 font-mono text-xs text-text-primary">
                            <span className="tabular-nums">{split.amount}</span>
                            <span className="text-text-muted">
                              {split.unitLabel}
                            </span>
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="align-middle">
                        <span
                          className="block truncate font-mono text-2xs text-text-muted"
                          title={s.source}
                        >
                          {s.source}
                        </span>
                      </td>
                      <td className="align-middle">
                        <div className="flex h-5 w-12 items-center justify-start">
                          {series.length >= 2 ? (
                            <MiniSparkline
                              values={series}
                              stroke={sensorStroke(s.category, s.unit)}
                              className="h-5 w-12"
                              width={48}
                              height={20}
                            />
                          ) : (
                            <span className="text-2xs text-text-ash">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!expanded && remaining > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex w-full items-center justify-center border-t border-hairline px-panel-x py-2.5 text-2xs font-medium text-text-muted transition-colors hover:bg-surface-elevated/50 hover:text-text-secondary"
            >
              + {remaining} more sensor{remaining === 1 ? '' : 's'}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

/** Prefer non-null fields from either SMART sample or disk-health summary. */
function mergeSmartWithHealth(
  reading: SmartReading,
  health: DiskHealthSummary | undefined,
): SmartReading {
  if (!health) return reading;
  return {
    ...reading,
    temperatureC: reading.temperatureC ?? health.temperatureC,
    wearPct: reading.wearPct ?? health.wearPct,
    powerOnHours: reading.powerOnHours ?? health.powerOnHours,
    healthStatus: reading.healthStatus ?? health.healthStatus,
    mediaType: reading.mediaType ?? health.mediaType,
  };
}

function mergeDiskHealthWithSmart(
  disks: DiskHealthSummary[],
  smart: SmartReading[],
): DiskHealthSummary[] {
  return disks.map((disk) => {
    const match = smart.find(
      (s) =>
        namesMatch(s.diskName, disk.diskName) ||
        namesMatch(s.model ?? '', disk.model ?? '') ||
        namesMatch(s.diskName, disk.model ?? ''),
    );
    if (!match) return disk;
    return {
      ...disk,
      temperatureC: disk.temperatureC ?? match.temperatureC,
      wearPct: disk.wearPct ?? match.wearPct,
      powerOnHours: disk.powerOnHours ?? match.powerOnHours,
      healthStatus: disk.healthStatus ?? match.healthStatus,
    };
  });
}

function namesMatch(a: string, b: string): boolean {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function SmartDisksPanel({
  readings,
  diskHealth,
}: {
  readings: SmartReading[];
  diskHealth: DiskHealthSummary[];
}) {
  const [expanded, setExpanded] = useState(false);
  const merged = useMemo(
    () =>
      readings.map((r) => {
        const health = diskHealth.find(
          (d) =>
            namesMatch(d.diskName, r.diskName) ||
            namesMatch(d.model ?? '', r.model ?? '') ||
            namesMatch(d.diskName, r.model ?? ''),
        );
        return mergeSmartWithHealth(r, health);
      }),
    [readings, diskHealth],
  );
  const visible = expanded ? merged : merged.slice(0, SMART_PREVIEW);

  return (
    <section className="panel min-w-0">
      <div className="panel-header flex items-center justify-between gap-2">
        <div>
          <p className="panel-title">SMART Disks</p>
          <p className="panel-subtitle">
            Health, temperature, and wear for attached drives
          </p>
        </div>
        {merged.length > SMART_PREVIEW ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-control border border-hairline px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
          >
            {expanded ? 'Show less' : 'View all'}
          </button>
        ) : null}
      </div>

      {merged.length === 0 ? (
        <p className="panel-body text-sm text-text-muted">
          No SMART readings in this sample.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table table-fixed">
            <colgroup>
              <col className="w-[40%]" />
              <col className="w-[22%]" />
              <col className="w-[16%]" />
              <col className="w-[22%]" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Disk</th>
                <th scope="col">Health</th>
                <th scope="col">Temp</th>
                <th scope="col">Wear</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <SmartDiskRow key={row.id} reading={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SmartDiskRow({ reading }: { reading: SmartReading }) {
  const wear =
    reading.wearPct !== null && Number.isFinite(reading.wearPct)
      ? Math.min(Math.max(reading.wearPct, 0), 100)
      : null;
  const healthy = isHealthyStatus(reading.healthStatus);

  return (
    <tr>
      <td className="align-middle">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-elevated text-text-muted">
            <HardDrive className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">
              {reading.diskName}
            </p>
            {reading.mediaType ? (
              <p className="text-2xs text-text-muted">{reading.mediaType}</p>
            ) : null}
          </div>
        </div>
      </td>
      <td className="align-middle">
        {healthy ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-status-success">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            Healthy
          </span>
        ) : (
          <span
            className={[
              'text-xs font-medium',
              smartStatusClass(reading.healthStatus),
            ].join(' ')}
          >
            {reading.healthStatus ?? '—'}
          </span>
        )}
      </td>
      <td className="align-middle tabular-nums text-text-secondary">
        {formatTemp(reading.temperatureC)}
      </td>
      <td className="align-middle">
        <div className="flex items-center gap-2">
          <span className="tabular-nums text-xs text-text-secondary">
            {formatOptionalPercent(reading.wearPct)}
          </span>
          <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-white/[0.06]">
            {wear !== null ? (
              <div
                className={[
                  'h-full rounded-full',
                  wear >= 50
                    ? 'bg-status-error'
                    : wear >= 20
                      ? 'bg-status-warning'
                      : 'bg-status-success',
                ].join(' ')}
                style={{ width: `${wear}%` }}
              />
            ) : null}
          </div>
        </div>
      </td>
    </tr>
  );
}

function DiskHealthSection({
  disks,
  loading,
  onRefresh,
}: {
  disks: DiskHealthSummary[];
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-header flex items-center justify-between gap-3">
        <div>
          <p className="panel-title">Disk health</p>
          <p className="panel-subtitle">SMART scores and wear signals</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          loading={loading && disks.length === 0}
          onClick={onRefresh}
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          Refresh
        </Button>
      </div>

      {disks.length === 0 ? (
        <div className="panel-body flex items-center gap-3">
          <HardDrive
            className="h-4 w-4 shrink-0 text-text-muted"
            strokeWidth={1.75}
          />
          <p className="text-sm text-text-muted">
            No scored disk health yet. Sample hardware or refresh after SMART
            collection.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-hairline">
          {disks.map((disk) => (
            <DiskHealthCard key={disk.diskName} disk={disk} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DiskHealthCard({ disk }: { disk: DiskHealthSummary }) {
  const [expanded, setExpanded] = useState(false);
  const attributes = disk.attributes ?? [];
  const hasAttributes = attributes.length > 0;
  const tone = healthScoreTone(disk.healthScore);
  const wear =
    disk.wearPct !== null && Number.isFinite(disk.wearPct)
      ? Math.min(Math.max(disk.wearPct, 0), 100)
      : null;

  const scoreBoxClass =
    tone === 'success'
      ? 'border-status-success/30 bg-status-success-bg text-status-success'
      : tone === 'warning'
        ? 'border-status-warning/30 bg-status-warning-bg text-status-warning'
        : 'border-status-error/30 bg-status-error-bg text-status-error';

  const metaParts = [
    disk.mediaType,
    disk.sizeBytes != null && disk.sizeBytes > 0
      ? formatBytes(disk.sizeBytes)
      : null,
  ].filter(Boolean);

  const subtitle =
    metaParts.length > 0
      ? metaParts.join('  ·  ')
      : (disk.model ?? 'Unknown model');

  const statusValue =
    disk.healthStatus ?? healthScoreLabel(disk.healthScore);
  const powerOnValue =
    disk.powerOnHours !== null
      ? `${disk.powerOnHours.toLocaleString()} h`
      : '—';

  const identity = (
    <div className="flex min-w-0 items-center gap-3">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface-elevated text-text-muted">
        <HardDrive className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-text-primary">
          {disk.model?.trim() || disk.diskName}
        </p>
        <p className="mt-0.5 truncate text-2xs text-text-muted">
          {subtitle}
          {disk.model &&
          disk.model.trim() &&
          disk.model.trim() !== disk.diskName
            ? `  ·  ${disk.diskName}`
            : ''}
        </p>
      </div>
    </div>
  );

  // Full-width even columns: drive + metrics + score fill the card (no dead right gap).
  const rowBody = (
    <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto] lg:items-center lg:gap-x-8">
      {identity}
      <DiskMetric
        label="Status"
        value={statusValue}
        valueClass={smartStatusClass(statusValue)}
      />
      <DiskMetric
        label="Temperature"
        value={formatTemp(disk.temperatureC)}
      />
      <DiskMetric label="Power-on Hours" value={powerOnValue} />
      <div className="min-w-0">
        <p className="text-2xs font-medium uppercase tracking-wide text-text-muted">
          Wear
        </p>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-sm font-medium tabular-nums text-text-primary">
            {formatOptionalPercent(disk.wearPct)}
          </span>
          <div className="h-1.5 min-w-[3rem] flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            {wear !== null ? (
              <div
                className={[
                  'h-full rounded-full',
                  wear >= 50
                    ? 'bg-status-error'
                    : wear >= 20
                      ? 'bg-status-warning'
                      : 'bg-status-success',
                ].join(' ')}
                style={{ width: `${wear}%` }}
              />
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-start gap-2 lg:justify-end">
        <div
          className={[
            'flex h-[3.25rem] min-w-[4.75rem] flex-col items-center justify-center rounded-control border px-3',
            scoreBoxClass,
          ].join(' ')}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
            Score
          </span>
          <span className="text-sm font-semibold tabular-nums leading-tight">
            {Math.round(disk.healthScore)}
            <span className="text-2xs font-medium opacity-70">/100</span>
          </span>
        </div>
        {hasAttributes ? (
          expanded ? (
            <ChevronDown
              className="h-4 w-4 shrink-0 text-text-muted"
              strokeWidth={1.75}
            />
          ) : (
            <ChevronRight
              className="h-4 w-4 shrink-0 text-text-muted"
              strokeWidth={1.75}
            />
          )
        ) : null}
      </div>
    </div>
  );

  return (
    <li>
      {hasAttributes ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-panel-x py-4 text-left transition-colors hover:bg-surface-elevated/40"
          aria-expanded={expanded}
        >
          {rowBody}
        </button>
      ) : (
        <div className="w-full px-panel-x py-4">{rowBody}</div>
      )}

      {disk.riskReasons.length > 0 ? (
        <ul className="list-inside list-disc space-y-0.5 px-panel-x pb-2 text-xs text-text-secondary">
          {disk.riskReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      {expanded && hasAttributes ? (
        <div className="border-t border-hairline px-panel-x py-3">
          <div className="overflow-auto rounded-control border border-hairline scrollbar-thin">
            <table className="data-table text-2xs">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">Raw</th>
                  <th className="text-right">Thresh</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {attributes.map((attr, index) => (
                  <SmartAttributeRow
                    key={`${attr.id ?? attr.name}-${index}`}
                    attr={attr}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function DiskMetric({
  label,
  value,
  valueClass = 'text-text-primary',
  className = '',
}: {
  label: string;
  value: string;
  valueClass?: string;
  className?: string;
}) {
  return (
    <div className={['min-w-0 text-left', className].filter(Boolean).join(' ')}>
      <p className="text-2xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p
        className={[
          'mt-1 text-sm font-medium tabular-nums text-left',
          valueClass,
        ].join(' ')}
      >
        {value}
      </p>
    </div>
  );
}

function SmartAttributeRow({ attr }: { attr: SmartAttribute }) {
  return (
    <tr>
      <td className="tabular-nums text-text-muted">{attr.id ?? '—'}</td>
      <td className="font-medium text-text-primary">{attr.name}</td>
      <td className="text-right tabular-nums">{attr.value ?? '—'}</td>
      <td className="text-right font-mono tabular-nums">{attr.raw ?? '—'}</td>
      <td className="text-right tabular-nums">{attr.threshold ?? '—'}</td>
      <td
        className={[
          'font-medium capitalize',
          smartStatusClass(attr.status),
        ].join(' ')}
      >
        {attr.status ?? '—'}
      </td>
    </tr>
  );
}
