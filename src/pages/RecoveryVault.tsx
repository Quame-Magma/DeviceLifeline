import { useEffect, useState } from 'react';
import { Archive } from 'lucide-react';
import { useVault } from '../hooks/use-vault';
import { useBackup } from '../hooks/use-backup';
import { useStorage } from '../hooks/use-storage';
import { usePaginatedItems } from '../hooks/use-pagination';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Pagination } from '../components/common/Pagination';
import { Spinner } from '../components/common/Spinner';
import { StatRow, StatTile } from '../components/common/StatTile';
import { StatusPill } from '../components/common/StatusPill';
import {
  DriveSelect,
  pickDefaultDrive,
} from '../components/storage/DriveSelect';
import { formatBytes, formatTimestamp } from '../lib/format';
import type { VaultEntry, VolumeShadow } from '../types/device.types';
import { PageShell } from '../components/layout/PageShell';

function kindLabel(kind: string): string {
  const labels: Record<string, string> = {
    restore_point: 'Restore point',
    dna_backup: 'DNA backup',
    directory_image: 'Directory image',
  };
  return labels[kind] ?? kind.replace(/_/g, ' ');
}

function statusTone(
  status: string,
): 'neutral' | 'success' | 'warning' | 'error' | 'info' {
  const s = status.toLowerCase();
  if (s === 'failed' || s === 'error') return 'error';
  if (s === 'running' || s === 'pending') return 'warning';
  if (s === 'completed' || s === 'success' || s === 'available')
    return 'success';
  return 'neutral';
}

/**
 * Vault + Macrium-class volume shadows and schedules.
 */
export function RecoveryVault() {
  const {
    entries,
    loading,
    acting: vaultActing,
    error: vaultError,
    message: vaultMessage,
    loadEntries,
    createRestorePoint,
    createDnaBackup,
    createDirectoryImage,
  } = useVault();

  const {
    shadows,
    schedules,
    loading: backupLoading,
    acting: backupActing,
    error: backupError,
    message: backupMessage,
    refresh: refreshBackup,
    createShadow,
    createSchedule,
    setEnabled,
    runNow,
    restore,
  } = useBackup();
  const { drives, loadDrives } = useStorage();

  const [volume, setVolume] = useState('C:\\');
  const [frequency, setFrequency] = useState('daily');
  const [restoreShadowId, setRestoreShadowId] = useState('');
  const [restoreRel, setRestoreRel] = useState('Users');
  const [restoreDest, setRestoreDest] = useState('');

  useEffect(() => {
    void loadEntries();
    void refreshBackup();
    void loadDrives();
  }, [loadEntries, refreshBackup, loadDrives]);

  useEffect(() => {
    if (drives.length === 0) return;
    setVolume((current) => pickDefaultDrive(drives, current));
  }, [drives]);

  const acting = vaultActing || backupActing;
  const error = vaultError || backupError;
  const message = vaultMessage || backupMessage;

  const { pageItems: pageEntries, pagination: entryPages } =
    usePaginatedItems(entries);
  const { pageItems: pageShadows, pagination: shadowPages } =
    usePaginatedItems(shadows);
  const { pageItems: pageSchedules, pagination: schedulePages } =
    usePaginatedItems(schedules);

  const handleDirectoryImage = () => {
    const path = window.prompt(
      'Enter the full path of the directory to image:',
    );
    if (path && path.trim().length > 0) {
      void createDirectoryImage(path.trim());
    }
  };

  const handleRestore = async () => {
    if (!restoreShadowId || !restoreRel.trim() || !restoreDest.trim()) {
      return;
    }
    const ok = window.confirm(
      `Restore "${restoreRel}" from shadow into:\n${restoreDest}\n\nContinue?`,
    );
    if (!ok) return;
    await restore(restoreShadowId, restoreRel.trim(), restoreDest.trim(), true);
  };

  useEffect(() => {
    if (!restoreShadowId && shadows[0]) {
      setRestoreShadowId(shadows[0].id);
    }
  }, [shadows, restoreShadowId]);

  useEffect(() => {
    if (!restoreDest) {
      // Default dest under user profile Downloads
      setRestoreDest('C:\\Users\\Public\\DeviceLifeline-Restore');
    }
  }, [restoreDest]);

  return (
    <PageShell
      title="Vault"
      description="Restore points, DNA backups, and volume shadows."
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            loading={acting}
            onClick={() => void createRestorePoint()}
          >
            Restore point
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={acting}
            onClick={() => void createDnaBackup()}
          >
            DNA backup
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={acting}
            onClick={handleDirectoryImage}
          >
            Directory image
          </Button>
        </>
      }
    >
      {error ? (
        <AlertBanner title="Vault / backup unavailable" message={error} />
      ) : null}
      {message && !error ? <AlertBanner title={message} tone="info" /> : null}

      <StatRow columns={4}>
        <StatTile label="Vault entries" value={entries.length} />
        <StatTile label="Volume shadows" value={shadows.length} />
        <StatTile label="Schedules" value={schedules.length} />
        <StatTile
          label="Schedules on"
          value={schedules.filter((s) => s.enabled).length}
        />
      </StatRow>

      {/* Macrium-class: shadows + schedules */}
      <section className="panel">
        <div className="panel-header flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="panel-title">Volume shadows</p>
            <p className="panel-subtitle">
              VSS checkpoints · create, schedule, restore files
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DriveSelect
              value={volume}
              drives={drives}
              onChange={setVolume}
              disabled={acting}
              className="field min-w-[14rem] max-w-xs font-mono"
              aria-label="Disk drive"
            />
            <Button
              variant="primary"
              size="sm"
              loading={acting}
              onClick={() =>
                void createShadow(volume || pickDefaultDrive(drives))
              }
            >
              Create shadow
            </Button>
            <select
              className="field w-28"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              aria-label="Schedule frequency"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="manual">Manual</option>
            </select>
            <Button
              variant="secondary"
              size="sm"
              loading={acting}
              onClick={() =>
                void createSchedule(
                  volume || pickDefaultDrive(drives),
                  frequency,
                )
              }
            >
              Add schedule
            </Button>
          </div>
        </div>

        {backupLoading && shadows.length === 0 ? (
          <div className="flex justify-center py-10">
            <Spinner label="Loading shadows…" />
          </div>
        ) : shadows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-text-muted">
            No volume shadows yet. Create one for {volume} (admin may be
            required for live VSS).
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Shadow</th>
                    <th>Volume</th>
                    <th>Device object</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {pageShadows.map((s) => (
                    <ShadowRow key={s.id} shadow={s} />
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={shadowPages} itemLabel="shadows" />
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <p className="panel-title">Backup schedules</p>
          <p className="panel-subtitle">Recurring volume checkpoints</p>
        </div>
        {schedules.length === 0 ? (
          <p className="px-4 py-6 text-sm text-text-muted">
            No schedules. Add a daily or weekly checkpoint for a volume.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Volume</th>
                    <th>Frequency</th>
                    <th>Enabled</th>
                    <th>Last run</th>
                    <th>Next run</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pageSchedules.map((sch) => (
                    <tr key={sch.id}>
                      <td className="font-mono text-xs">{sch.volume}</td>
                      <td className="capitalize">{sch.frequency}</td>
                      <td>
                        <StatusPill tone={sch.enabled ? 'success' : 'neutral'}>
                          {sch.enabled ? 'On' : 'Off'}
                        </StatusPill>
                      </td>
                      <td className="text-xs">
                        {sch.lastRunAt ? formatTimestamp(sch.lastRunAt) : '—'}
                      </td>
                      <td className="text-xs">
                        {sch.nextRunAt ? formatTimestamp(sch.nextRunAt) : '—'}
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={acting}
                            onClick={() =>
                              void setEnabled(sch.id, !sch.enabled)
                            }
                          >
                            {sch.enabled ? 'Disable' : 'Enable'}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={acting}
                            onClick={() => void runNow(sch.id)}
                          >
                            Run now
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={schedulePages} itemLabel="schedules" />
          </>
        )}
      </section>

      <section className="panel p-4">
        <p className="text-sm font-semibold text-text-primary">
          Restore file from shadow
        </p>
        <p className="mt-0.5 text-xs text-text-muted">
          Copies a relative path out of a VSS device object into a destination
          folder.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
          <label className="text-xs text-text-muted">
            Shadow
            <select
              className="field mt-1"
              value={restoreShadowId}
              onChange={(e) => setRestoreShadowId(e.target.value)}
            >
              {shadows.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.volume} · {s.shadowId.slice(0, 12)}…
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-muted">
            Relative path in volume
            <input
              className="field mt-1 font-mono"
              value={restoreRel}
              onChange={(e) => setRestoreRel(e.target.value)}
              placeholder="Users\\Public\\Documents\\file.txt"
            />
          </label>
          <label className="text-xs text-text-muted lg:col-span-2">
            Destination path
            <input
              className="field mt-1 font-mono"
              value={restoreDest}
              onChange={(e) => setRestoreDest(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-3">
          <Button
            variant="primary"
            size="sm"
            loading={acting}
            disabled={!restoreShadowId}
            onClick={() => void handleRestore()}
          >
            Restore
          </Button>
        </div>
      </section>

      {/* Existing vault entries */}
      {loading && entries.length === 0 ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading vault…" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Archive className="h-8 w-8" strokeWidth={1.75} />}
          heading="Vault entries empty"
          body="Create a restore point, DNA backup, or directory image."
          action={
            <Button
              variant="primary"
              size="sm"
              loading={acting}
              onClick={() => void createRestorePoint()}
            >
              Create restore point
            </Button>
          }
        />
      ) : (
        <section className="panel">
          <div className="panel-header">
            <p className="panel-title">Vault entries</p>
            <p className="panel-subtitle">Local recovery artifacts</p>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th className="text-right">Size</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {pageEntries.map((entry) => (
                  <VaultRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={entryPages} itemLabel="entries" />
        </section>
      )}
    </PageShell>
  );
}

function ShadowRow({ shadow }: { shadow: VolumeShadow }) {
  return (
    <tr>
      <td
        className="max-w-[180px] truncate font-mono text-xs"
        title={shadow.shadowId}
      >
        {shadow.shadowId}
      </td>
      <td className="font-mono text-xs">{shadow.volume}</td>
      <td
        className="max-w-[220px] truncate font-mono text-2xs text-text-muted"
        title={shadow.deviceObject ?? undefined}
      >
        {shadow.deviceObject ?? '—'}
      </td>
      <td>
        <StatusPill tone={statusTone(shadow.status)}>
          {shadow.status}
        </StatusPill>
      </td>
      <td className="text-xs">{formatTimestamp(shadow.createdAt)}</td>
    </tr>
  );
}

function VaultRow({ entry }: { entry: VaultEntry }) {
  return (
    <tr>
      <td>
        <p className="max-w-[280px] truncate font-medium text-text-primary">
          {entry.title}
        </p>
        {entry.detail ? (
          <p className="max-w-[280px] truncate text-2xs text-text-muted">
            {entry.detail}
          </p>
        ) : null}
      </td>
      <td>{kindLabel(entry.kind)}</td>
      <td>
        <StatusPill tone={statusTone(entry.status)}>{entry.status}</StatusPill>
      </td>
      <td className="text-right tabular-nums">
        {entry.sizeBytes > 0 ? formatBytes(entry.sizeBytes) : '—'}
      </td>
      <td className="text-xs">{formatTimestamp(entry.createdAt)}</td>
    </tr>
  );
}
