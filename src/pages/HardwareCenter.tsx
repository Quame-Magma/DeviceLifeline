import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Cpu } from 'lucide-react';
import { useHardware } from '../hooks/use-hardware';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { Spinner } from '../components/common/Spinner';
import { StatusPill } from '../components/common/StatusPill';
import { formatBytes, formatTimestamp } from '../lib/format';
import type {
  DiskHealthSummary,
  SmartAttribute,
  SmartReading,
} from '../types/device.types';

function formatTemp(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '-';
  }
  return `${Math.round(value)}°C`;
}

function formatMhz(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '-';
  }
  return `${Math.round(value)} MHz`;
}

function formatOptionalPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '-';
  }
  return `${Math.round(value)}%`;
}

function healthScoreTone(
  score: number,
): 'success' | 'warning' | 'error' {
  if (score >= 80) {
    return 'success';
  }
  if (score >= 50) {
    return 'warning';
  }
  return 'error';
}

function healthScoreLabel(score: number): string {
  if (score >= 80) {
    return 'Good';
  }
  if (score >= 50) {
    return 'Caution';
  }
  return 'At risk';
}

function smartStatusClass(status: string | null | undefined): string {
  if (!status) {
    return 'text-text-secondary';
  }
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

/**
 * Hardware Center - CPU/GPU temps, clocks, SMART disks, and disk health scores.
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
  }, [loadHardware]);

  return (
    <div className="page-shell page-section">
      <PageHeader
        title="Performance"
        description="Sensors, clocks, GPU load, and disk health — HWiNFO-class OS telemetry."
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
              onClick={() => void collectSample()}
            >
              {sampling ? 'Sampling…' : 'Sample hardware'}
            </Button>
          </>
        }
      />

      {error ? (
        <AlertBanner title="Hardware sample unavailable" message={error} />
      ) : null}

      <section className="panel">
        <div className="panel-header flex items-center justify-between gap-3">
          <div>
            <p className="panel-title">Disk health</p>
            <p className="panel-subtitle">SMART and wear signals</p>
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

        <div className="p-4">
          {diskHealth.length === 0 ? (
            <p className="text-sm text-text-secondary">
              No disk health summaries yet. Sample hardware or refresh after a
              SMART collection.
            </p>
          ) : (
            <ul className="space-y-3">
              {diskHealth.map((disk) => (
                <DiskHealthCard key={disk.diskName} disk={disk} />
              ))}
            </ul>
          )}
        </div>
      </section>

      {loading && !latest ? (
        <div className="flex items-center justify-center py-16">
          <Spinner label="Loading hardware..." />
        </div>
      ) : !latest ? (
        <EmptyState
          icon={<Cpu className="h-8 w-8" strokeWidth={1.75} />}
          heading="No hardware sample yet"
          body="Capture a sample to read temperatures, GPU metrics, and SMART data for this device."
          action={
            <Button
              variant="primary"
              size="sm"
              loading={sampling}
              onClick={() => void collectSample()}
            >
              Sample hardware
            </Button>
          }
        />
      ) : (
        <>
          <p className="text-xs text-text-muted">
            Captured {formatTimestamp(latest.capturedAt)}
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card padding="sm">
              <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
                CPU temp
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
                {formatTemp(latest.cpuTempC)}
              </p>
            </Card>
            <Card padding="sm">
              <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
                CPU clock
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
                {formatMhz(latest.cpuClockMhz)}
              </p>
            </Card>
            <Card padding="sm">
              <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
                GPU temp
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
                {formatTemp(latest.gpuTempC)}
              </p>
              {latest.gpuName && (
                <p
                  className="mt-0.5 truncate text-2xs text-text-muted"
                  title={latest.gpuName}
                >
                  {latest.gpuName}
                </p>
              )}
            </Card>
            <Card padding="sm">
              <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
                GPU usage
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
                {formatOptionalPercent(latest.gpuUsagePct)}
              </p>
              <p className="mt-0.5 text-2xs text-text-muted">
                VRAM{' '}
                {latest.gpuVramUsed !== null
                  ? formatBytes(latest.gpuVramUsed)
                  : '-'}
                {' / '}
                {latest.gpuVramTotal !== null
                  ? formatBytes(latest.gpuVramTotal)
                  : '-'}
              </p>
            </Card>
          </div>

          <section className="panel">
            <div className="panel-header">
              <p className="panel-title">Sensors</p>
              <p className="panel-subtitle">
                Every sensor the OS / vendor tools expose · missing = empty, never
                faked
              </p>
            </div>
            {(latest.sensors?.length ?? 0) === 0 ? (
              <p className="px-4 pb-4 text-sm text-text-secondary">
                No expanded sensor readings in this sample. Sample again after
                opening Hardware — thermal zones, GPU load, and fans are
                collected when the OS exposes them.
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
                            ? `${s.value}${s.unit ? ` ${s.unit}` : ''}`
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

          <Card padding="none">
            <div className="border-b border-surface-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                SMART disks
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                Health, temperature, and wear for attached drives
              </p>
            </div>
            {latest.smart.length === 0 ? (
              <EmptyState
                heading="No SMART data"
                body="This sample did not include disk SMART readings."
              />
            ) : (
              <div className="overflow-auto scrollbar-thin">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-surface">
                    <tr className="border-b border-surface-border">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Disk
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Model
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Health
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Temp
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Power-on
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Wear
                      </th>
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
          </Card>
        </>
      )}
    </div>
  );
}

function DiskHealthCard({ disk }: { disk: DiskHealthSummary }) {
  const [expanded, setExpanded] = useState(false);
  const attributes = disk.attributes ?? [];
  const hasAttributes = attributes.length > 0;

  return (
    <li className="rounded-card border border-surface-border bg-surface-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary">
            {disk.diskName}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {disk.model ?? 'Unknown model'}
            {disk.mediaType ? ` · ${disk.mediaType}` : ''}
          </p>
        </div>
        <StatusPill tone={healthScoreTone(disk.healthScore)}>
          {`${healthScoreLabel(disk.healthScore)} (${disk.healthScore})`}
        </StatusPill>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-text-muted">
        <span>Status: {disk.healthStatus ?? '-'}</span>
        <span>Temp: {formatTemp(disk.temperatureC)}</span>
        <span>Wear: {formatOptionalPercent(disk.wearPct)}</span>
        <span>
          Power-on:{' '}
          {disk.powerOnHours !== null
            ? `${disk.powerOnHours.toLocaleString()} h`
            : '-'}
        </span>
        <span>Serial: {disk.serial ?? '-'}</span>
        <span>
          Size:{' '}
          {typeof disk.sizeBytes === 'number'
            ? formatBytes(disk.sizeBytes)
            : '-'}
        </span>
      </div>
      {disk.riskReasons.length > 0 ? (
        <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-text-secondary">
          {disk.riskReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-text-muted">No risk reasons.</p>
      )}

      <div className="mt-3">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium text-text-primary hover:text-white"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
          SMART attributes
          {hasAttributes ? ` (${attributes.length})` : ''}
        </button>
        {expanded &&
          (hasAttributes ? (
            <div className="mt-2 overflow-auto rounded-card border border-surface-border bg-surface scrollbar-thin">
              <table className="w-full border-collapse text-2xs">
                <thead className="bg-surface-muted">
                  <tr className="border-b border-surface-border">
                    <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-text-secondary">
                      ID
                    </th>
                    <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-text-secondary">
                      Name
                    </th>
                    <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wide text-text-secondary">
                      Value
                    </th>
                    <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wide text-text-secondary">
                      Raw
                    </th>
                    <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-wide text-text-secondary">
                      Threshold
                    </th>
                    <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-text-secondary">
                      Status
                    </th>
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
          ) : (
            <p className="mt-2 text-xs text-text-muted">
              No SMART attributes available for this disk.
            </p>
          ))}
      </div>
    </li>
  );
}

function SmartAttributeRow({ attr }: { attr: SmartAttribute }) {
  return (
    <tr className="border-b border-surface-border last:border-b-0">
      <td className="px-2 py-1.5 tabular-nums text-text-muted">
        {attr.id ?? '-'}
      </td>
      <td className="px-2 py-1.5 font-medium text-text-primary">{attr.name}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-text-secondary">
        {attr.value ?? '-'}
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-text-secondary">
        {attr.raw ?? '-'}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-text-secondary">
        {attr.threshold ?? '-'}
      </td>
      <td
        className={[
          'px-2 py-1.5 font-medium capitalize',
          smartStatusClass(attr.status),
        ].join(' ')}
      >
        {attr.status ?? '-'}
      </td>
    </tr>
  );
}

function SmartRow({ reading }: { reading: SmartReading }) {
  return (
    <tr className="border-b border-surface-border last:border-b-0 hover:bg-surface/80">
      <td className="px-4 py-2.5">
        <p className="font-medium text-text-primary">{reading.diskName}</p>
        {reading.mediaType && (
          <p className="text-2xs text-text-muted">{reading.mediaType}</p>
        )}
      </td>
      <td
        className="max-w-[200px] truncate px-4 py-2.5 text-text-secondary"
        title={reading.model ?? undefined}
      >
        {reading.model ?? '-'}
      </td>
      <td className="px-4 py-2.5 text-text-secondary">
        {reading.healthStatus ?? '-'}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
        {formatTemp(reading.temperatureC)}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
        {reading.powerOnHours !== null
          ? `${reading.powerOnHours.toLocaleString()} h`
          : '-'}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
        {formatOptionalPercent(reading.wearPct)}
      </td>
    </tr>
  );
}
