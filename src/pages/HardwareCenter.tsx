import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CircuitBoard,
  Cpu,
  Gauge,
  HardDrive,
  Thermometer,
} from 'lucide-react';
import { useHardware } from '../hooks/use-hardware';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Spinner } from '../components/common/Spinner';
import { StatRow, StatTile } from '../components/common/StatTile';
import { StatusPill } from '../components/common/StatusPill';
import { PageShell } from '../components/layout/PageShell';
import { formatBytes, formatTimestamp } from '../lib/format';
import type {
  DiskHealthSummary,
  SmartAttribute,
  SmartReading,
} from '../types/device.types';

function formatTemp(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  return `${Math.round(value)}°C`;
}

function formatMhz(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
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

function smartStatusClass(status: string | null | undefined): string {
  if (!status) return 'text-text-secondary';
  const normalized = status.toLowerCase();
  if (
    normalized.includes('ok') ||
    normalized.includes('good') ||
    normalized.includes('pass')
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

function tempTone(
  value: number | null,
): 'success' | 'warning' | 'error' | 'muted' {
  if (value === null || !Number.isFinite(value)) return 'muted';
  if (value < 70) return 'success';
  if (value < 85) return 'warning';
  return 'error';
}

/**
 * Performance — Overview-class layout: metric strip first, then dense panels.
 */
export function HardwareCenter() {
  const {
    latest,
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

  return (
    <PageShell
      title="Performance"
      description="Sensors, clocks, GPU load, and disk health."
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            loading={loading}
            onClick={() => void loadDiskHealth()}
          >
            Disk health
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={sampling}
            onClick={handleSample}
          >
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
        <>
          {/* Metric strip — same density as Overview resource tiles */}
          <StatRow columns={4}>
            <StatTile
              icon={Thermometer}
              label="CPU temp"
              value={formatTemp(latest.cpuTempC)}
              hint={
                latest.cpuTempC === null
                  ? 'No sensor data'
                  : tempTone(latest.cpuTempC) === 'success'
                    ? 'Normal'
                    : tempTone(latest.cpuTempC) === 'warning'
                      ? 'Warm'
                      : 'Hot'
              }
              tone={tempTone(latest.cpuTempC)}
            />
            <StatTile
              icon={Gauge}
              label="CPU clock"
              value={formatMhz(latest.cpuClockMhz)}
              hint={
                latest.cpuClockMhz !== null
                  ? 'Current frequency'
                  : 'No sensor data'
              }
            />
            <StatTile
              icon={Thermometer}
              label="GPU temp"
              value={formatTemp(latest.gpuTempC)}
              hint={
                latest.gpuName
                  ? latest.gpuName
                  : latest.gpuTempC === null
                    ? 'No sensor data'
                    : tempTone(latest.gpuTempC) === 'success'
                      ? 'Normal'
                      : 'Warm'
              }
              tone={tempTone(latest.gpuTempC)}
            />
            <StatTile
              icon={CircuitBoard}
              label="GPU usage"
              value={formatOptionalPercent(latest.gpuUsagePct)}
              hint={`VRAM ${
                latest.gpuVramUsed !== null
                  ? formatBytes(latest.gpuVramUsed)
                  : '—'
              } / ${
                latest.gpuVramTotal !== null
                  ? formatBytes(latest.gpuVramTotal)
                  : '—'
              }`}
            />
          </StatRow>

          {/* Two-column detail panels — Overview findings | actions rhythm */}
          <div className="grid gap-3 lg:grid-cols-2">
            <section className="panel min-w-0">
              <div className="panel-header flex items-center justify-between gap-2">
                <div>
                  <p className="panel-title">Sensors</p>
                  <p className="panel-subtitle">
                    Captured {formatTimestamp(latest.capturedAt)}
                  </p>
                </div>
              </div>
              {(latest.sensors?.length ?? 0) === 0 ? (
                <p className="panel-body text-sm text-text-muted">
                  No expanded sensor readings in this sample.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Sensor</th>
                        <th>Category</th>
                        <th className="text-right">Value</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(latest.sensors ?? []).map((s) => (
                        <tr key={`${s.category}-${s.name}-${s.source}`}>
                          <td className="font-medium text-text-primary">
                            {s.name}
                          </td>
                          <td className="text-xs capitalize">{s.category}</td>
                          <td className="text-right font-mono tabular-nums">
                            {Number.isFinite(s.value)
                              ? formatSensorValue(s.value, s.unit)
                              : '—'}
                          </td>
                          <td className="font-mono text-2xs text-text-muted">
                            {s.source}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel min-w-0">
              <div className="panel-header">
                <p className="panel-title">SMART disks</p>
                <p className="panel-subtitle">
                  Health, temperature, and wear for attached drives
                </p>
              </div>
              {latest.smart.length === 0 ? (
                <p className="panel-body text-sm text-text-muted">
                  No SMART readings in this sample.
                </p>
              ) : (
                <div className="overflow-auto scrollbar-thin">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Disk</th>
                        <th>Health</th>
                        <th className="text-right">Temp</th>
                        <th className="text-right">Wear</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latest.smart.map((row) => (
                        <SmartRow key={row.id} reading={row} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          {/* Disk health scores — only when we have summaries (no empty lead panel) */}
          <section className="panel">
            <div className="panel-header flex items-center justify-between gap-3">
              <div>
                <p className="panel-title">Disk health</p>
                <p className="panel-subtitle">SMART scores and wear signals</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                loading={loading && diskHealth.length === 0}
                onClick={() => void loadDiskHealth()}
              >
                Refresh
              </Button>
            </div>
            {diskHealth.length === 0 ? (
              <div className="panel-body flex items-center gap-3">
                <HardDrive
                  className="h-4 w-4 flex-shrink-0 text-text-muted"
                  strokeWidth={1.75}
                />
                <p className="text-sm text-text-muted">
                  No scored disk health yet. Sample hardware or refresh after
                  SMART collection.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-hairline">
                {diskHealth.map((disk) => (
                  <DiskHealthCard key={disk.diskName} disk={disk} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </PageShell>
  );
}

function formatSensorValue(
  value: number,
  unit: string | null | undefined,
): string {
  if (unit === '%' || unit === 'percent') {
    return `${Number(value.toFixed(1))} %`;
  }
  if (unit === '°C' || unit === 'C') {
    return `${Math.round(value)} °C`;
  }
  if (unit === 'MHz') {
    return `${Math.round(value)} MHz`;
  }
  // Avoid dumping 15-decimal PDH floats
  if (Math.abs(value) > 0 && Math.abs(value) < 1) {
    return `${value.toFixed(2)}${unit ? ` ${unit}` : ''}`;
  }
  if (Number.isInteger(value)) {
    return `${value}${unit ? ` ${unit}` : ''}`;
  }
  return `${Number(value.toFixed(2))}${unit ? ` ${unit}` : ''}`;
}

function DiskHealthCard({ disk }: { disk: DiskHealthSummary }) {
  const [expanded, setExpanded] = useState(false);
  const attributes = disk.attributes ?? [];
  const hasAttributes = attributes.length > 0;

  return (
    <li className="panel-row">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {disk.diskName}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {disk.model ?? 'Unknown model'}
            {disk.mediaType ? ` · ${disk.mediaType}` : ''}
          </p>
        </div>
        <StatusPill tone={healthScoreTone(disk.healthScore)}>
          {`${healthScoreLabel(disk.healthScore)} (${disk.healthScore})`}
        </StatusPill>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-text-muted">
        <span>Status: {disk.healthStatus ?? '—'}</span>
        <span>Temp: {formatTemp(disk.temperatureC)}</span>
        <span>Wear: {formatOptionalPercent(disk.wearPct)}</span>
        <span>
          Power-on:{' '}
          {disk.powerOnHours !== null
            ? `${disk.powerOnHours.toLocaleString()} h`
            : '—'}
        </span>
      </div>
      {disk.riskReasons.length > 0 ? (
        <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-text-secondary">
          {disk.riskReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {hasAttributes ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-2xs font-medium text-text-secondary hover:text-text-primary"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
          {expanded ? 'Hide' : 'Show'} SMART attributes
        </button>
      ) : null}
      {expanded && hasAttributes ? (
        <div className="mt-2 overflow-auto rounded-control border border-hairline scrollbar-thin">
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
      ) : null}
    </li>
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

function SmartRow({ reading }: { reading: SmartReading }) {
  return (
    <tr>
      <td>
        <p className="font-medium text-text-primary">{reading.diskName}</p>
        {reading.mediaType ? (
          <p className="text-2xs text-text-muted">{reading.mediaType}</p>
        ) : null}
      </td>
      <td>{reading.healthStatus ?? '—'}</td>
      <td className="text-right tabular-nums">
        {formatTemp(reading.temperatureC)}
      </td>
      <td className="text-right tabular-nums">
        {formatOptionalPercent(reading.wearPct)}
      </td>
    </tr>
  );
}
