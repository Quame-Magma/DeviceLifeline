import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  ChevronRight,
  HardDrive,
  Monitor,
  MoreVertical,
  Play,
  RefreshCcw,
  Search,
  ShieldAlert,
  Volume2,
  Wifi,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useDrivers } from '../hooks/use-drivers';
import { useElevation } from '../hooks/use-elevation';
import { usePaginatedItems } from '../hooks/use-pagination';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { MiniSparkline } from '../components/common/MiniSparkline';
import { Pagination } from '../components/common/Pagination';
import { Spinner } from '../components/common/Spinner';
import { StatusPill } from '../components/common/StatusPill';
import { PageShell } from '../components/layout/PageShell';
import { confirmAction, toastInfo } from '../lib/feedback';
import { formatTimestamp } from '../lib/format';
import type { DriverInfo } from '../types/device.types';

function healthTone(score: number): 'success' | 'warning' | 'error' {
  if (score < 40) return 'error';
  if (score < 70) return 'warning';
  return 'success';
}

function healthLabel(score: number): string {
  if (score < 40) return 'Critical';
  if (score < 70) return 'Needs attention';
  return 'Good';
}

function driverCategory(driver: DriverInfo): string {
  const value = `${driver.deviceClass ?? ''} ${driver.name}`.toLowerCase();
  if (
    value.includes('display') ||
    value.includes('graphics') ||
    value.includes('gpu') ||
    value.includes('video')
  ) {
    return 'Display';
  }
  if (
    value.includes('net') ||
    value.includes('wi-fi') ||
    value.includes('wifi') ||
    value.includes('ethernet') ||
    value.includes('wlan')
  ) {
    return 'Network';
  }
  if (value.includes('audio') || value.includes('sound') || value.includes('media')) {
    return 'Audio';
  }
  if (
    value.includes('storage') ||
    value.includes('disk') ||
    value.includes('nvme') ||
    value.includes('scsi') ||
    value.includes('usb')
  ) {
    return 'Storage';
  }
  return 'System';
}

function categoryIcon(category: string): LucideIcon {
  switch (category) {
    case 'Display':
      return Monitor;
    case 'Network':
      return Wifi;
    case 'Audio':
      return Volume2;
    case 'Storage':
      return HardDrive;
    default:
      return Wrench;
  }
}

function categoryIconClass(category: string): string {
  switch (category) {
    case 'Display':
      return 'bg-[#2b7ee0]/20 text-[#4ea8ff]';
    case 'Network':
      return 'bg-cyan-500/15 text-cyan-400';
    case 'Audio':
      return 'bg-status-warning-bg text-status-warning';
    case 'Storage':
      return 'bg-status-success-bg text-status-success';
    default:
      return 'bg-purple-500/15 text-purple-300';
  }
}

const CHECKLIST = [
  'Closed games, browsers, and GPU control panels',
  'Downloaded a clean offline driver from NVIDIA / AMD / Intel',
  'Understand display may use Basic Display until reinstall',
  'Prefer Safe Mode for stubborn packages (manual guidance)',
  'Accept System Restore may be needed if clean fails',
] as const;

/**
 * Drivers — mock layout: stat strip, guided GPU clean workflow, health table.
 */
export function DriverCenter() {
  const {
    drivers,
    loading,
    scanning,
    cleaning,
    plan,
    cleanResult,
    restorePoint,
    error,
    message,
    loadDrivers,
    scan,
    previewClean,
    createRestoreGate,
    executeClean,
  } = useDrivers();
  const { status: elev, refresh: refreshElev, elevate } = useElevation();

  const [vendor, setVendor] = useState('auto');
  const [category, setCategory] = useState('all');
  const [filter, setFilter] = useState('');
  const [checks, setChecks] = useState<boolean[]>(() =>
    CHECKLIST.map(() => false),
  );

  useEffect(() => {
    void loadDrivers();
    void refreshElev();
  }, [loadDrivers, refreshElev]);

  const seenMessage = useRef<string | null>(null);
  useEffect(() => {
    if (!message || error) return;
    if (seenMessage.current === message) return;
    seenMessage.current = message;
    toastInfo(message);
  }, [message, error]);

  const categories = useMemo(
    () => Array.from(new Set(drivers.map(driverCategory))).sort(),
    [drivers],
  );

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return drivers
      .filter(
        (driver) =>
          category === 'all' || driverCategory(driver) === category,
      )
      .filter((driver) => {
        if (!query) return true;
        return [
          driver.name,
          driver.manufacturer,
          driver.driverVersion,
          driver.deviceClass,
          driver.signer,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.healthScore - b.healthScore);
  }, [category, drivers, filter]);

  const unsignedCount = drivers.filter((d) => !d.isSigned).length;
  const lowHealthCount = drivers.filter((d) => d.healthScore < 70).length;
  const overallHealth = drivers.length
    ? Math.round(
        drivers.reduce((sum, d) => sum + d.healthScore, 0) / drivers.length,
      )
    : 0;
  const healthSparkline = useMemo(
    () =>
      [...drivers]
        .sort((a, b) => a.healthScore - b.healthScore)
        .slice(0, 16)
        .map((d) => d.healthScore),
    [drivers],
  );

  const { pageItems, pagination } = usePaginatedItems(filtered);

  const allChecked = checks.every(Boolean);
  const elevated = elev?.elevated === true;
  const restoreOk = restorePoint?.status === 'completed';

  const handleExecute = async () => {
    if (!plan || !restoreOk || !allChecked || !elevated) return;
    const ok = await confirmAction({
      title: 'Remove GPU driver packages?',
      description:
        `About to remove ${plan.packages.length} display driver package(s).\n\n` +
        `This is destructive. A restore point was created.\n` +
        `Reboot and install a clean vendor driver afterward.`,
      confirmLabel: 'Remove packages',
      tone: 'danger',
    });
    if (!ok) return;
    void executeClean(true);
  };

  return (
    <PageShell
      title="Drivers"
      description="Signature status, health scores, and guided GPU clean."
      titleExtra={
        <span className="rounded-md bg-status-success/15 px-2 py-0.5 text-[11px] font-bold tracking-wide text-status-success">
          {drivers.length} total
        </span>
      }
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            loading={scanning}
            onClick={() => void scan()}
          >
            {!scanning ? (
              <RefreshCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
            ) : null}
            {scanning ? 'Scanning…' : 'Scan drivers'}
          </Button>
        </div>
      }
    >
      {error ? (
        <AlertBanner title="Drivers / clean unavailable" message={error} />
      ) : null}

      {/* Metric strip */}
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <StatCard
          icon={HardDrive}
          iconClass="bg-status-success/15 text-status-success"
          label="Total drivers"
          value={drivers.length.toLocaleString()}
          hint="All installed drivers"
          hintClass="text-status-success"
        />
        <StatCard
          icon={Activity}
          iconClass="bg-purple-500/20 text-purple-300"
          label="Unsigned drivers"
          value={unsignedCount.toLocaleString()}
          hint="Require attention"
          hintClass="text-purple-300"
        />
        <StatCard
          icon={ShieldAlert}
          iconClass="bg-status-error/15 text-status-error"
          label="Drivers under 70"
          value={lowHealthCount.toLocaleString()}
          hint="Low health score"
          hintClass="text-status-error"
        />
        <StatCard
          icon={Activity}
          iconClass="bg-sky-500/20 text-sky-400"
          label="Overall driver health"
          value={String(overallHealth)}
          hint={
            drivers.length > 0
              ? `Avg of ${drivers.length} scored drivers`
              : healthLabel(overallHealth)
          }
          hintClass="text-sky-400"
          chart={
            healthSparkline.length >= 2 ? (
              <MiniSparkline
                values={healthSparkline}
                stroke="#25d99a"
                className="h-7 w-20 opacity-90"
                width={84}
                height={28}
              />
            ) : null
          }
        />
      </div>

      {/* GPU clean guided */}
      <section className="panel overflow-hidden">
        <div className="panel-header">
          <p className="panel-title">GPU driver clean (guided)</p>
          <p className="panel-subtitle">
            Checklist — restore point — remove GPU packages — elevated — audited
          </p>
        </div>

        <div className="grid gap-5 border-b border-hairline px-panel-x py-4 lg:grid-cols-[minmax(200px,240px)_minmax(0,1fr)]">
          <div className="space-y-2.5 lg:border-r lg:border-hairline lg:pr-5">
            <label
              className="text-2xs font-semibold uppercase tracking-wide text-text-muted"
              htmlFor="driver-vendor"
            >
              Vendor
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                id="driver-vendor"
                className="field min-w-[11rem]"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
              >
                <option value="auto">Auto (Recommended)</option>
                <option value="nvidia">NVIDIA</option>
                <option value="amd">AMD</option>
                <option value="intel">Intel</option>
              </select>
              <StatusPill tone={elevated ? 'success' : 'warning'}>
                {elevated ? 'Elevated' : 'Not elevated'}
              </StatusPill>
            </div>
            {!elevated ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void elevate()}
              >
                Elevate
              </Button>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 sm:gap-x-8">
            {CHECKLIST.map((label, index) => (
              <label
                key={label}
                className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-text-secondary"
                htmlFor={`gpu-check-${index}`}
              >
                <input
                  id={`gpu-check-${index}`}
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-hairline accent-status-success"
                  checked={checks[index]}
                  onChange={(e) => {
                    const next = [...checks];
                    next[index] = e.target.checked;
                    setChecks(next);
                  }}
                />
                <span className={checks[index] ? 'text-text-primary' : ''}>
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* 3-step workflow */}
        <div
          className="m-4 grid overflow-hidden rounded-control border border-hairline sm:grid-cols-3"
          aria-label="GPU clean workflow"
        >
          <WorkflowStep
            icon={Search}
            title="Preview"
            subtitle="Review changes"
            onClick={() => void previewClean(vendor)}
            disabled={cleaning}
            showArrow
          />
          <WorkflowStep
            icon={Activity}
            title="Restore point"
            subtitle="Create restore point"
            onClick={() => void createRestoreGate()}
            disabled={cleaning || !allChecked}
            showArrow
          />
          <WorkflowStep
            icon={Play}
            title="Execute clean"
            subtitle="Remove & reinstall"
            onClick={() => {
              void handleExecute();
            }}
            disabled={
              cleaning || !plan || !restoreOk || !allChecked || !elevated
            }
            primary
          />
        </div>

        {plan ? (
          <div className="mx-panel-x mb-3 rounded-control border border-hairline bg-surface-elevated/40 px-3.5 py-3 text-xs">
            <p className="font-medium text-text-primary">
              Plan · {plan.vendor} · {plan.packages.length} package(s) ·{' '}
              {plan.targets.length} device(s)
              {plan.services && plan.services.length > 0
                ? ` · ${plan.services.length} service(s)`
                : ''}
              {plan.rebootExpected ? ' · reboot expected' : ''}
            </p>
            {plan.packages.length > 0 ? (
              <p className="mt-1 font-mono text-2xs text-text-muted">
                {plan.packages.join(', ')}
              </p>
            ) : (
              <p className="mt-1 text-text-secondary">
                No OEM display packages matched yet.
              </p>
            )}
            {plan.warnings.length > 0 ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-2xs text-text-muted">
                {plan.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {restorePoint ? (
          <p className="mb-3 px-panel-x text-xs text-text-secondary">
            Restore point: {restorePoint.title} ·{' '}
            <StatusPill
              tone={
                restorePoint.status === 'completed' ? 'success' : 'error'
              }
            >
              {restorePoint.status}
            </StatusPill>
          </p>
        ) : null}

        {cleanResult ? (
          <p className="mb-3 px-panel-x text-xs text-text-secondary">
            Result: {cleanResult.status} — {cleanResult.message}
            {cleanResult.packagesRemoved.length > 0
              ? ` Removed: ${cleanResult.packagesRemoved.join(', ')}`
              : ''}
          </p>
        ) : null}
      </section>

      {/* By health table */}
      <section className="panel overflow-hidden">
        <div className="panel-header flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="panel-title">By health</p>
            <p className="panel-subtitle">Lowest score first</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="field min-w-[9rem]"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Driver category"
            >
              <option value="all">All categories</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
                strokeWidth={1.75}
                aria-hidden
              />
              <input
                className="field w-full pl-8"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter drivers…"
                aria-label="Filter drivers"
              />
            </div>
          </div>
        </div>

        {loading && drivers.length === 0 ? (
          <div className="flex justify-center py-16">
            <Spinner label="Loading drivers…" />
          </div>
        ) : drivers.length === 0 ? (
          <EmptyState
            icon={<Wrench className="h-8 w-8" strokeWidth={1.75} />}
            heading="No drivers scanned"
            body="Run a scan to inventory installed drivers."
            action={
              <Button
                variant="primary"
                size="sm"
                loading={scanning}
                onClick={() => void scan()}
              >
                Scan drivers
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            heading="No matching drivers"
            body="Try another category or clear the filter."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Manufacturer</th>
                    <th>Signed</th>
                    <th>Health</th>
                    <th>Version</th>
                    <th>Date</th>
                    <th className="w-10" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((driver) => (
                    <DriverRow key={driver.id} driver={driver} />
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={pagination} itemLabel="drivers" />
          </>
        )}
      </section>
    </PageShell>
  );
}

function StatCard({
  icon: Icon,
  iconClass,
  label,
  value,
  hint,
  hintClass,
  chart,
}: {
  icon: LucideIcon;
  iconClass: string;
  label: string;
  value: string;
  hint: string;
  hintClass?: string;
  chart?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-[5.5rem] items-start gap-3 overflow-hidden rounded-card border border-hairline bg-surface-card px-panel-x py-panel-y shadow-card">
      <span
        className={[
          'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          iconClass,
        ].join(' ')}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 pr-16">
        <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-text-primary cause-semibold">
          {value}
        </p>
        <p className={['mt-1 text-2xs', hintClass ?? 'text-text-muted'].join(' ')}>
          {hint}
        </p>
      </div>
      {chart ? (
        <div className="absolute bottom-3 right-3 opacity-90">{chart}</div>
      ) : null}
    </div>
  );
}

function WorkflowStep({
  icon: Icon,
  title,
  subtitle,
  onClick,
  disabled,
  showArrow,
  primary,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
  showArrow?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'relative flex min-h-[4.25rem] items-center gap-3 border-hairline px-4 py-3 text-left transition-colors sm:border-r sm:last:border-r-0',
        primary
          ? 'bg-surface-elevated/80 text-text-primary hover:bg-surface-elevated'
          : 'bg-surface-elevated/40 text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
        'disabled:cursor-not-allowed disabled:opacity-45',
      ].join(' ')}
    >
      <span
        className={[
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border',
          primary
            ? 'border-status-success/30 bg-status-success/15 text-status-success'
            : 'border-hairline text-text-muted',
        ].join(' ')}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm font-semibold">{title}</strong>
        <small className="mt-0.5 block text-2xs text-text-muted">
          {subtitle}
        </small>
      </span>
      {showArrow ? (
        <ChevronRight
          className="h-4 w-4 shrink-0 text-text-ash"
          strokeWidth={1.75}
          aria-hidden
        />
      ) : null}
    </button>
  );
}

function DriverRow({ driver }: { driver: DriverInfo }) {
  const cat = driverCategory(driver);
  const Icon = categoryIcon(cat);

  return (
    <tr>
      <td className="align-middle">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={[
              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
              categoryIconClass(cat),
            ].join(' ')}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </span>
          <span
            className="truncate text-sm font-medium text-text-primary"
            title={driver.name}
          >
            {driver.name}
          </span>
        </div>
      </td>
      <td className="align-middle">
        <span
          className="block max-w-[12rem] truncate text-text-secondary"
          title={driver.manufacturer ?? undefined}
        >
          {driver.manufacturer ?? '—'}
        </span>
      </td>
      <td className="align-middle">
        <StatusPill tone={driver.isSigned ? 'success' : 'warning'}>
          {driver.isSigned ? 'Signed' : 'Unsigned'}
        </StatusPill>
      </td>
      <td className="align-middle">
        <StatusPill tone={healthTone(driver.healthScore)}>
          {String(driver.healthScore)}
        </StatusPill>
      </td>
      <td className="align-middle font-mono text-xs tabular-nums text-text-secondary">
        {driver.driverVersion ?? '—'}
      </td>
      <td className="align-middle text-xs text-text-muted">
        {driver.driverDate ? formatTimestamp(driver.driverDate) : '—'}
      </td>
      <td className="align-middle">
        <button
          type="button"
          className="rounded p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary"
          aria-label={`Copy details for ${driver.name}`}
          title="Copy details"
          onClick={() => {
            const text = [
              driver.name,
              driver.manufacturer,
              driver.driverVersion,
              driver.signer,
              driver.infName,
              ...(driver.riskReasons ?? []).slice(0, 3),
            ]
              .filter(Boolean)
              .join(' · ');
            void navigator.clipboard
              .writeText(text)
              .then(() => toastInfo('Driver details copied'))
              .catch(() => toastInfo(text));
          }}
        >
          <MoreVertical className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </td>
    </tr>
  );
}
