import { useEffect, useMemo, useState } from 'react';
import { HardDrive, Radar } from 'lucide-react';
import { useIntelligence } from '../hooks/use-intelligence';
import { useStorage } from '../hooks/use-storage';
import { usePaginatedItems } from '../hooks/use-pagination';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { Pagination } from '../components/common/Pagination';
import { Spinner } from '../components/common/Spinner';
import { StatusPill } from '../components/common/StatusPill';
import { DiskTreemap } from '../components/storage/DiskTreemap';
import {
  DriveSelect,
  pickDefaultDrive,
} from '../components/storage/DriveSelect';
import { formatBytes, formatTimestamp } from '../lib/format';
import type { StorageFolderNode, StorageItem } from '../types/device.types';

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    large_file: 'Large file',
    temp: 'Temp',
    cache: 'Cache',
    downloads: 'Downloads',
    media: 'Media',
    other: 'Other',
  };
  return labels[category] ?? category.replace(/_/g, ' ');
}

function scanStatusTone(
  status: string,
): 'neutral' | 'success' | 'warning' | 'error' | 'info' {
  const s = status.toLowerCase();
  if (s === 'completed' || s === 'success' || s === 'done') {
    return 'success';
  }
  if (s === 'running' || s === 'pending') {
    return 'warning';
  }
  if (s === 'failed' || s === 'error') {
    return 'error';
  }
  return 'neutral';
}

/**
 * Storage Center - scan disk usage, folder map, large files, and cleanup.
 */
export function StorageCenter() {
  const {
    scan,
    items,
    folderMap,
    drives,
    loading,
    scanning,
    mapping,
    error,
    loadLatest,
    loadDrives,
    runScan,
    loadFolderMap,
    loadVolumeMap,
  } = useStorage();
  const {
    cleanupPreview: preview,
    cleanupResult,
    cleanupLoading,
    error: cleanupError,
    previewCleanup,
    executeCleanup,
  } = useIntelligence();

  const [mapRoot, setMapRoot] = useState('');
  const [volumeRoot, setVolumeRoot] = useState('C:\\');

  useEffect(() => {
    void loadLatest();
    void loadDrives();
  }, [loadLatest, loadDrives]);

  useEffect(() => {
    if (drives.length === 0) return;
    setVolumeRoot((current) => pickDefaultDrive(drives, current));
  }, [drives]);

  const handleBuildMap = () => {
    const root = mapRoot.trim();
    void loadFolderMap(root.length > 0 ? root : null);
  };

  const handleVolumeMap = () => {
    const volume = volumeRoot.trim() || pickDefaultDrive(drives);
    void loadVolumeMap(volume);
  };

  const handlePreviewCleanup = () => {
    void previewCleanup();
  };

  const handleExecuteCleanup = () => {
    const confirmed = window.confirm(
      'Execute safe cleanup?\n\nThis permanently deletes temporary and cache files only. Application data, documents, and downloads are not touched.\n\nContinue?',
    );
    if (!confirmed) {
      return;
    }
    void executeCleanup(true);
  };

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; bytes: number }>();
    for (const item of items) {
      const current = map.get(item.category) ?? { count: 0, bytes: 0 };
      current.count += 1;
      current.bytes += item.sizeBytes;
      map.set(item.category, current);
    }
    return Array.from(map.entries())
      .map(([category, stats]) => ({ category, ...stats }))
      .sort((a, b) => b.bytes - a.bytes);
  }, [items]);

  const largeFiles = useMemo(
    () =>
      [...items]
        .filter((item) => !item.isDirectory)
        .sort((a, b) => b.sizeBytes - a.sizeBytes),
    [items],
  );

  const { pageItems: pageLargeFiles, pagination: largeFilePages } =
    usePaginatedItems(largeFiles);

  const folderChildren = folderMap?.children ?? [];

  return (
    <div className="page-shell page-section">
      <PageHeader
        title="Storage"
        description="WizTree-class folder maps and treemaps, large files, and safe cleanup."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              loading={cleanupLoading}
              onClick={handlePreviewCleanup}
            >
              Preview cleanup
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={cleanupLoading}
              onClick={handleExecuteCleanup}
            >
              Execute cleanup
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={scanning}
              onClick={() => void runScan()}
            >
              {!scanning && (
                <Radar
                  aria-hidden="true"
                  className="h-4 w-4"
                  strokeWidth={1.75}
                />
              )}
              {scanning ? 'Scanning...' : 'Scan storage'}
            </Button>
          </>
        }
      />

      {error ? (
        <AlertBanner title="Storage unavailable" message={error} />
      ) : null}
      {cleanupError ? (
        <AlertBanner title="Cleanup unavailable" message={cleanupError} />
      ) : null}

      <Card padding="md">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Folder map
              </p>
              <p className="mt-0.5 text-sm text-text-muted">
                Pick a disk for a volume map, or optionally set a folder root
                for a narrower map. Volume maps are capped (~12s) so the UI
                stays responsive.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                loading={mapping}
                onClick={handleBuildMap}
              >
                {mapping ? 'Building...' : 'Build map'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={mapping}
                onClick={handleVolumeMap}
              >
                {mapping
                  ? 'Building...'
                  : `Volume map (${volumeRoot.replace(/\\$/, '') || 'disk'})`}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label
              htmlFor="volume-map-root"
              className="text-2xs font-semibold uppercase tracking-wide text-text-muted sm:w-24 sm:flex-shrink-0"
            >
              Disk
            </label>
            <DriveSelect
              id="volume-map-root"
              value={volumeRoot}
              drives={drives}
              onChange={setVolumeRoot}
              disabled={mapping}
              className="field min-w-0 flex-1 font-mono"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label
              htmlFor="folder-map-root"
              className="text-2xs font-semibold uppercase tracking-wide text-text-muted sm:w-24 sm:flex-shrink-0"
            >
              Folder
            </label>
            <input
              id="folder-map-root"
              type="text"
              value={mapRoot}
              onChange={(e) => setMapRoot(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleBuildMap();
                }
              }}
              placeholder="Optional — empty uses user profile"
              className="field min-w-0 flex-1 font-mono"
            />
          </div>
        </div>

        {mapping && !folderMap ? (
          <div className="mt-4 flex items-center justify-center py-8">
            <Spinner label="Building folder map..." />
          </div>
        ) : !folderMap ? (
          <p className="mt-4 text-sm text-text-secondary">
            Build a map or volume map to see relative folder sizes.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">
                  {folderMap.name || folderMap.path}
                </p>
                <p
                  className="truncate font-mono text-2xs text-text-muted"
                  title={folderMap.path}
                >
                  {folderMap.path}
                </p>
              </div>
              <p className="text-sm tabular-nums text-text-secondary">
                {formatBytes(folderMap.sizeBytes)} ·{' '}
                {folderMap.fileCount.toLocaleString()} files
              </p>
            </div>
            {folderChildren.length === 0 ? (
              <p className="text-sm text-text-secondary">
                No child folders returned for this root.
              </p>
            ) : (
              <>
                <DiskTreemap root={folderMap} height={300} />
                <ul className="space-y-2">
                  {folderChildren.map((child) => (
                    <FolderMapRow key={child.path} node={child} depth={0} />
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </Card>

      {(preview || cleanupResult) && (
        <Card padding="md">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Safe cleanup
          </p>
          {preview && (
            <div className="mt-2">
              <p className="text-sm font-medium text-text-primary">
                {preview.title}
              </p>
              {preview.detail && (
                <p className="mt-1 text-sm text-text-secondary">
                  {preview.detail}
                </p>
              )}
              {preview.preview && (
                <pre className="mt-2 max-h-40 overflow-auto rounded border border-hairline bg-surface p-3 text-2xs text-text-secondary scrollbar-thin">
                  {preview.preview}
                </pre>
              )}
              <p className="mt-2 text-2xs text-text-muted">
                Status: {preview.status}
                {preview.finishedAt
                  ? ` · ${formatTimestamp(preview.finishedAt)}`
                  : ` · ${formatTimestamp(preview.createdAt)}`}
              </p>
            </div>
          )}
          {cleanupResult && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <p className="text-sm text-text-secondary">
                Deleted{' '}
                <span className="font-semibold text-text-primary">
                  {cleanupResult.deletedCount}
                </span>{' '}
                items
              </p>
              <p className="text-sm text-text-secondary">
                Freed{' '}
                <span className="font-semibold text-text-primary">
                  {formatBytes(cleanupResult.deletedBytes)}
                </span>
              </p>
              <p className="text-sm text-text-secondary">
                Failed{' '}
                <span className="font-semibold text-text-primary">
                  {cleanupResult.failedCount}
                </span>
              </p>
            </div>
          )}
          {cleanupResult && cleanupResult.errors.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-2xs text-status-error">
              {cleanupResult.errors.slice(0, 5).map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {loading && !scan ? (
        <div className="flex items-center justify-center py-16">
          <Spinner label="Loading storage..." />
        </div>
      ) : !scan ? (
        <EmptyState
          icon={<HardDrive className="h-8 w-8" strokeWidth={1.75} />}
          heading="No storage scan yet"
          body="Run a scan to inventory large files and category usage on this device."
          action={
            <Button
              variant="primary"
              size="sm"
              loading={scanning}
              onClick={() => void runScan()}
            >
              Scan storage
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Card padding="sm">
              <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
                Total scanned
              </p>
              <p className="mt-1 text-xl font-semibold text-text-primary">
                {formatBytes(scan.totalBytes)}
              </p>
            </Card>
            <Card padding="sm">
              <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
                Files
              </p>
              <p className="mt-1 text-xl font-semibold text-text-primary">
                {scan.fileCount.toLocaleString()}
              </p>
            </Card>
            <Card padding="sm">
              <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
                Directories
              </p>
              <p className="mt-1 text-xl font-semibold text-text-primary">
                {scan.dirCount.toLocaleString()}
              </p>
            </Card>
            <Card padding="sm">
              <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
                Status
              </p>
              <div className="mt-1">
                <StatusPill tone={scanStatusTone(scan.status)}>
                  {scan.status}
                </StatusPill>
              </div>
              <p className="mt-1.5 text-2xs text-text-muted">
                {scan.finishedAt
                  ? formatTimestamp(scan.finishedAt)
                  : formatTimestamp(scan.createdAt)}
              </p>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_1fr]">
            <Card padding="md">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Category breakdown
              </p>
              {categoryBreakdown.length === 0 ? (
                <p className="mt-3 text-sm text-text-secondary">
                  No categorized items in this scan.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {categoryBreakdown.map((row) => (
                    <li
                      key={row.category}
                      className="flex items-start justify-between gap-3 border-b border-hairline pb-2 last:border-b-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary">
                          {categoryLabel(row.category)}
                        </p>
                        <p className="text-2xs text-text-muted">
                          {row.count} item{row.count === 1 ? '' : 's'}
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-sm tabular-nums text-text-secondary">
                        {formatBytes(row.bytes)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card padding="none">
              <div className="border-b border-hairline px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Largest files
                </p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {largeFiles.length} files · 10 per page
                </p>
              </div>
              {largeFiles.length === 0 ? (
                <EmptyState
                  heading="No files found"
                  body="This scan did not return file-level items."
                />
              ) : (
                <>
                  <div className="overflow-auto scrollbar-thin">
                    <table className="data-table">
                      <thead className="sticky top-0 z-10 bg-surface">
                        <tr>
                          <th>Name</th>
                          <th>Category</th>
                          <th className="text-right">Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageLargeFiles.map((item) => (
                          <StorageItemRow key={item.id} item={item} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination pagination={largeFilePages} itemLabel="files" />
                </>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function FolderMapRow({
  node,
  depth,
}: {
  node: StorageFolderNode;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0;
  const pct = Math.min(Math.max(node.pctOfParent, 0), 100);

  return (
    <li>
      <button
        type="button"
        className={[
          'w-full rounded-card border border-hairline bg-surface px-3 py-2 text-left transition-colors',
          hasChildren ? 'cursor-pointer hover:bg-surface' : 'cursor-default',
        ].join(' ')}
        style={{ marginLeft: depth > 0 ? `${depth * 12}px` : undefined }}
        onClick={() => {
          if (hasChildren) {
            setExpanded((v) => !v);
          }
        }}
        disabled={!hasChildren}
        aria-expanded={hasChildren ? expanded : undefined}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p
              className="truncate text-sm font-medium text-text-primary"
              title={node.path}
            >
              {hasChildren ? (expanded ? '- ' : '+ ') : ''}
              {node.name}
            </p>
            <p className="text-2xs text-text-muted">
              {node.fileCount.toLocaleString()} files · {pct.toFixed(1)}% of
              parent
            </p>
          </div>
          <span className="flex-shrink-0 text-sm tabular-nums text-text-secondary">
            {formatBytes(node.sizeBytes)}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded bg-surface">
          <div
            className="h-full rounded bg-white/40"
            style={{ width: `${pct}%` }}
            role="presentation"
          />
        </div>
      </button>
      {hasChildren && expanded && (
        <ul className="mt-2 space-y-2">
          {node.children.map((child) => (
            <FolderMapRow key={child.path} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function StorageItemRow({ item }: { item: StorageItem }) {
  return (
    <tr className="border-b border-hairline last:border-b-0 hover:bg-surface/80">
      <td className="max-w-[320px] px-4 py-2.5">
        <p className="truncate font-medium text-text-primary" title={item.path}>
          {item.name}
        </p>
        <p className="truncate text-2xs text-text-muted" title={item.path}>
          {item.path}
        </p>
      </td>
      <td className="px-4 py-2.5 text-text-secondary">
        {categoryLabel(item.category)}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
        {formatBytes(item.sizeBytes)}
      </td>
    </tr>
  );
}
