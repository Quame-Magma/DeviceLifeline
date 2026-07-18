import { useEffect, useMemo, useState } from 'react';
import { Wrench } from 'lucide-react';
import { useDrivers } from '../hooks/use-drivers';
import { useElevation } from '../hooks/use-elevation';
import { usePaginatedItems } from '../hooks/use-pagination';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Pagination } from '../components/common/Pagination';
import { Spinner } from '../components/common/Spinner';
import { StatRow, StatTile } from '../components/common/StatTile';
import { StatusPill } from '../components/common/StatusPill';
import { formatTimestamp } from '../lib/format';
import type { DriverInfo } from '../types/device.types';
import { PageShell } from '../components/layout/PageShell';

function healthTone(score: number): 'success' | 'warning' | 'error' {
  if (score < 40) return 'error';
  if (score < 70) return 'warning';
  return 'success';
}

const CHECKLIST = [
  'Closed games, browsers, and GPU control panels',
  'Downloaded a clean offline driver from NVIDIA / AMD / Intel',
  'Understand display may use Basic Display until reinstall',
  'Prefer Safe Mode for stubborn packages (manual guidance)',
  'Accept System Restore may be needed if clean fails',
] as const;

/**
 * Drivers inventory + guided DDU-class GPU clean wizard.
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
  const [checks, setChecks] = useState<boolean[]>(() =>
    CHECKLIST.map(() => false),
  );

  useEffect(() => {
    void loadDrivers();
    void refreshElev();
  }, [loadDrivers, refreshElev]);

  const sorted = useMemo(
    () => [...drivers].sort((a, b) => a.healthScore - b.healthScore),
    [drivers],
  );

  const unsignedCount = drivers.filter((d) => !d.isSigned).length;
  const lowHealthCount = drivers.filter((d) => d.healthScore < 70).length;
  const { pageItems, pagination } = usePaginatedItems(sorted);

  const allChecked = checks.every(Boolean);
  const elevated = elev?.elevated === true;
  const restoreOk = restorePoint?.status === 'completed';

  const handleExecute = () => {
    if (!plan || !restoreOk || !allChecked || !elevated) return;
    const ok = window.confirm(
      `Remove ${plan.packages.length} display driver package(s)?\n\n` +
        `This is destructive. A restore point was created.\n` +
        `Reboot and install a clean vendor driver afterward.\n\nContinue?`,
    );
    if (!ok) return;
    void executeClean(true);
  };

  return (
    <PageShell
      title="Drivers"
      description="Signature status, health scores, and guided GPU clean."
      actions={
        <Button
          variant="primary"
          size="sm"
          loading={scanning}
          onClick={() => void scan()}
        >
          {scanning ? 'Scanning…' : 'Scan drivers'}
        </Button>
      }
    >
      {error ? (
        <AlertBanner title="Drivers / clean unavailable" message={error} />
      ) : null}
      {message && !error ? <AlertBanner title={message} tone="info" /> : null}

      <StatRow columns={3}>
        <StatTile label="Drivers" value={drivers.length} />
        <StatTile label="Unsigned" value={unsignedCount} />
        <StatTile label="Health under 70" value={lowHealthCount} />
      </StatRow>

      {/* DDU-class guided clean */}
      <section className="panel">
        <div className="panel-header">
          <p className="panel-title">GPU driver clean (guided)</p>
          <p className="panel-subtitle">
            Checklist → restore point → remove GPU packages · elevated + audited
          </p>
        </div>

        <div className="panel-body space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
              Vendor
            </label>
            <select
              className="field w-36"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              aria-label="GPU vendor"
            >
              <option value="auto">Auto</option>
              <option value="nvidia">NVIDIA</option>
              <option value="amd">AMD</option>
              <option value="intel">Intel</option>
            </select>
            <StatusPill tone={elevated ? 'success' : 'warning'}>
              {elevated ? 'Elevated' : 'Not elevated'}
            </StatusPill>
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

          <ul className="space-y-2">
            {CHECKLIST.map((label, i) => (
              <li key={label} className="flex items-start gap-2 text-sm">
                <input
                  id={`gpu-check-${i}`}
                  type="checkbox"
                  className="mt-1"
                  checked={checks[i]}
                  onChange={(e) => {
                    const next = [...checks];
                    next[i] = e.target.checked;
                    setChecks(next);
                  }}
                />
                <label
                  htmlFor={`gpu-check-${i}`}
                  className="text-text-secondary"
                >
                  {label}
                </label>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={cleaning}
              onClick={() => void previewClean(vendor)}
            >
              1 · Preview
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={cleaning}
              disabled={!allChecked}
              onClick={() => void createRestoreGate()}
            >
              2 · Restore point
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={cleaning}
              disabled={!plan || !restoreOk || !allChecked || !elevated}
              onClick={handleExecute}
            >
              3 · Execute clean
            </Button>
          </div>

          {plan ? (
            <div className="rounded-control border border-hairline bg-surface-elevated p-3 text-sm">
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
            <p className="text-xs text-text-secondary">
              Restore point: {restorePoint.title} ·{' '}
              <StatusPill
                tone={restorePoint.status === 'completed' ? 'success' : 'error'}
              >
                {restorePoint.status}
              </StatusPill>
            </p>
          ) : null}

          {cleanResult ? (
            <p className="text-sm text-text-primary">
              Result: {cleanResult.status} — {cleanResult.message}
              {cleanResult.packagesRemoved.length > 0
                ? ` Removed: ${cleanResult.packagesRemoved.join(', ')}`
                : ''}
            </p>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <p className="panel-title">By health</p>
          <p className="panel-subtitle">Lowest score first</p>
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

function DriverRow({ driver }: { driver: DriverInfo }) {
  return (
    <tr>
      <td className="font-medium text-text-primary">
        <span className="block max-w-[220px] truncate" title={driver.name}>
          {driver.name}
        </span>
      </td>
      <td>
        <span className="block max-w-[160px] truncate">
          {driver.manufacturer ?? '—'}
        </span>
      </td>
      <td>
        <StatusPill tone={driver.isSigned ? 'success' : 'warning'}>
          {driver.isSigned ? 'Signed' : 'Unsigned'}
        </StatusPill>
      </td>
      <td>
        <StatusPill tone={healthTone(driver.healthScore)}>
          {String(driver.healthScore)}
        </StatusPill>
      </td>
      <td className="font-mono text-xs">{driver.driverVersion ?? '—'}</td>
      <td className="text-xs">
        {driver.driverDate ? formatTimestamp(driver.driverDate) : '—'}
      </td>
    </tr>
  );
}
