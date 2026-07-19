import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Eraser,
  ExternalLink,
  Eye,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Film,
  Folder,
  FolderOpen,
  HardDrive,
  Lightbulb,
  Radar,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useIntelligence } from '../hooks/use-intelligence';
import { useStorage } from '../hooks/use-storage';
import {
  DEFAULT_PAGE_SIZE,
  usePaginatedItems,
} from '../hooks/use-pagination';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Pagination } from '../components/common/Pagination';
import { Spinner } from '../components/common/Spinner';
import { DiskTreemap } from '../components/storage/DiskTreemap';
import {
  DriveSelect,
  pickDefaultDrive,
} from '../components/storage/DriveSelect';
import { PageShell } from '../components/layout/PageShell';
import { confirmAction } from '../lib/feedback';
import { formatBytes, formatTimestamp } from '../lib/format';
import type {
  LogicalDrive,
  StorageFolderNode,
  StorageItem,
  StorageScan,
} from '../types/device.types';

type VolumeBucket = 'system' | 'apps' | 'files' | 'other';

const VOLUME_META: Record<
  VolumeBucket,
  { label: string; color: string; swatch: string }
> = {
  system: {
    label: 'System & OS',
    color: '#5b9dff',
    swatch: 'bg-[#5b9dff]',
  },
  apps: {
    label: 'Apps & Programs',
    color: '#a78bfa',
    swatch: 'bg-[#a78bfa]',
  },
  files: {
    label: 'Files & Data',
    color: '#f5a623',
    swatch: 'bg-[#f5a623]',
  },
  other: {
    label: 'Other',
    color: '#f07178',
    swatch: 'bg-[#f07178]',
  },
};

const CATEGORY_STYLE: Record<
  string,
  { icon: LucideIcon; bar: string; iconBg: string; iconFg: string }
> = {
  large_file: {
    icon: HardDrive,
    bar: 'bg-[#5b9dff]',
    iconBg: 'bg-[#5b9dff]/15',
    iconFg: 'text-[#5b9dff]',
  },
  other: {
    icon: Folder,
    bar: 'bg-[#a78bfa]',
    iconBg: 'bg-[#a78bfa]/15',
    iconFg: 'text-[#a78bfa]',
  },
  media: {
    icon: Film,
    bar: 'bg-[#f5a623]',
    iconBg: 'bg-[#f5a623]/15',
    iconFg: 'text-[#f5a623]',
  },
  temp: {
    icon: FolderOpen,
    bar: 'bg-status-success',
    iconBg: 'bg-status-success-bg',
    iconFg: 'text-status-success',
  },
  cache: {
    icon: FolderOpen,
    bar: 'bg-status-success',
    iconBg: 'bg-status-success-bg',
    iconFg: 'text-status-success',
  },
  downloads: {
    icon: FileArchive,
    bar: 'bg-[#22d3ee]',
    iconBg: 'bg-[#22d3ee]/15',
    iconFg: 'text-[#22d3ee]',
  },
  documents: {
    icon: FileText,
    bar: 'bg-[#f472b6]',
    iconBg: 'bg-[#f472b6]/15',
    iconFg: 'text-[#f472b6]',
  },
};

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    large_file: 'Large files',
    temp: 'Temp',
    cache: 'Cache',
    downloads: 'Downloads',
    media: 'Media',
    documents: 'Documents',
    other: 'Other',
  };
  return labels[category] ?? category.replace(/_/g, ' ');
}

function categoryStyle(category: string) {
  return (
    CATEGORY_STYLE[category] ?? {
      icon: File,
      bar: 'bg-text-muted',
      iconBg: 'bg-surface-elevated',
      iconFg: 'text-text-muted',
    }
  );
}

function fileIcon(name: string): LucideIcon {
  const ext = name.includes('.')
    ? name.slice(name.lastIndexOf('.') + 1).toLowerCase()
    : '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext)) {
    return FileImage;
  }
  if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm'].includes(ext)) {
    return FileVideo;
  }
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) {
    return FileAudio;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'iso', 'cab', 'msp'].includes(ext)) {
    return FileArchive;
  }
  if (
    ['exe', 'msi', 'dll', 'sys', 'bat', 'cmd', 'ps1', 'js', 'ts', 'py', 'json'].includes(
      ext,
    )
  ) {
    return FileCode;
  }
  if (['txt', 'md', 'log', 'csv', 'pdf', 'doc', 'docx'].includes(ext)) {
    return FileText;
  }
  return File;
}

function driveDisplayName(drive: LogicalDrive | undefined, volumeRoot: string): string {
  if (!drive) {
    const letter = volumeRoot.replace(/\\$/, '') || 'C:';
    return `Local Disk (${letter})`;
  }
  const letter = drive.name.replace(/\\$/, '');
  if (drive.label?.trim()) {
    return `${drive.label.trim()} (${letter})`;
  }
  return `Local Disk (${letter})`;
}

function classifyFolderName(name: string): VolumeBucket {
  const n = name.toLowerCase().trim();
  if (
    n === 'windows' ||
    n === 'boot' ||
    n === 'system volume information' ||
    n === 'recovery' ||
    n === 'perflogs' ||
    n.startsWith('$')
  ) {
    return 'system';
  }
  if (
    n.includes('program files') ||
    n === 'programdata' ||
    n === 'appdata' ||
    n === 'intel' ||
    n === 'amd' ||
    n === 'nvidia'
  ) {
    return 'apps';
  }
  if (
    n === 'users' ||
    n === 'documents' ||
    n === 'downloads' ||
    n === 'desktop' ||
    n === 'pictures' ||
    n === 'videos' ||
    n === 'music' ||
    n === 'public'
  ) {
    return 'files';
  }
  return 'other';
}

function classifyItemCategory(category: string): VolumeBucket {
  const c = category.toLowerCase();
  if (c === 'temp' || c === 'cache') return 'system';
  if (c === 'media' || c === 'downloads' || c === 'documents' || c === 'large_file') {
    return 'files';
  }
  return 'other';
}

function buildVolumeBreakdown(
  usedBytes: number,
  folderMap: StorageFolderNode | null,
  categoryRows: Array<{ category: string; bytes: number }>,
): Record<VolumeBucket, number> {
  const empty: Record<VolumeBucket, number> = {
    system: 0,
    apps: 0,
    files: 0,
    other: 0,
  };

  if (usedBytes <= 0) return empty;

  // Prefer volume/folder map top-level classification when available
  if (folderMap && folderMap.children.length > 0) {
    const buckets = { ...empty };
    for (const child of folderMap.children) {
      buckets[classifyFolderName(child.name)] += Math.max(0, child.sizeBytes);
    }
    const sum = buckets.system + buckets.apps + buckets.files + buckets.other;
    if (sum > 0) {
      // Scale classified portion into usedBytes; remainder → other
      const scale = usedBytes / sum;
      if (sum <= usedBytes * 1.15) {
        // Map covers roughly the volume — scale lightly or pad remainder
        const scaled = {
          system: buckets.system * (sum > usedBytes ? scale : 1),
          apps: buckets.apps * (sum > usedBytes ? scale : 1),
          files: buckets.files * (sum > usedBytes ? scale : 1),
          other: buckets.other * (sum > usedBytes ? scale : 1),
        };
        const scaledSum =
          scaled.system + scaled.apps + scaled.files + scaled.other;
        if (scaledSum < usedBytes) {
          scaled.other += usedBytes - scaledSum;
        }
        return scaled;
      }
    }
  }

  // Fallback: scan categories → buckets, scale to usedBytes
  if (categoryRows.length > 0) {
    const buckets = { ...empty };
    for (const row of categoryRows) {
      buckets[classifyItemCategory(row.category)] += row.bytes;
    }
    const sum = buckets.system + buckets.apps + buckets.files + buckets.other;
    if (sum > 0) {
      const scale = usedBytes / sum;
      return {
        system: buckets.system * scale,
        apps: buckets.apps * scale,
        files: buckets.files * scale,
        // Give apps a floor from residual so the bar isn't empty-looking
        other: buckets.other * scale,
      };
    }
  }

  // Last resort: all used space as "Files & Data" + small other
  return {
    system: usedBytes * 0.35,
    apps: usedBytes * 0.25,
    files: usedBytes * 0.3,
    other: usedBytes * 0.1,
  };
}

/**
 * Storage — redesigned to ChatGPT mock:
 * volume hero, folder map, scan stats, category bars, largest files, tip.
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
  const [showTips, setShowTips] = useState(false);
  const [tipDismissed, setTipDismissed] = useState(false);

  useEffect(() => {
    void loadLatest();
    void loadDrives();
  }, [loadLatest, loadDrives]);

  // Refresh drive list so newly inserted removable volumes appear as cards.
  useEffect(() => {
    const id = window.setInterval(() => {
      void loadDrives();
    }, 8000);
    return () => window.clearInterval(id);
  }, [loadDrives]);

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

  const handleExecuteCleanup = async () => {
    const confirmed = await confirmAction({
      title: 'Execute safe cleanup?',
      description:
        'This permanently deletes temporary and cache files only. Application data, documents, and downloads are not touched.',
      confirmLabel: 'Execute cleanup',
      tone: 'warning',
    });
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
  const maxCategoryBytes = categoryBreakdown[0]?.bytes ?? 1;

  return (
    <PageShell
      title="Storage"
      description="Folder maps, large files, and safe cleanup."
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            loading={cleanupLoading}
            onClick={handlePreviewCleanup}
          >
            <Eye className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Preview cleanup
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={cleanupLoading}
            onClick={() => {
              void handleExecuteCleanup();
            }}
          >
            <Eraser className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Execute cleanup
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={scanning}
            onClick={() => void runScan()}
          >
            {!scanning ? (
              <Radar className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            ) : null}
            {scanning ? 'Scanning…' : 'Scan storage'}
          </Button>
        </>
      }
    >
      {error ? (
        <AlertBanner title="Storage unavailable" message={error} />
      ) : null}
      {cleanupError ? (
        <AlertBanner title="Cleanup unavailable" message={cleanupError} />
      ) : null}

      {/* One capacity card per mounted drive (C:, D:, USB, …) */}
      {drives.length > 0 ? (
        <div className="flex flex-col gap-2">
          {drives.map((drive) => {
            const isSelected =
              drive.name.toLowerCase() === volumeRoot.toLowerCase();
            const mapForDrive =
              folderMap && pathOnDrive(folderMap.path, drive.name)
                ? folderMap
                : null;
            // Only attach scan categories when this scan actually covered the drive
            const categoriesForDrive =
              scan && pathOnDrive(scan.rootPath, drive.name)
                ? categoryBreakdown
                : [];
            return (
              <VolumeHero
                key={drive.name}
                drive={drive}
                selected={isSelected}
                folderMap={mapForDrive}
                categoryBreakdown={categoriesForDrive}
                onSelect={() => setVolumeRoot(drive.name)}
              />
            );
          })}
        </div>
      ) : (
        <VolumeHero
          drive={null}
          selected
          folderMap={null}
          categoryBreakdown={[]}
          onSelect={undefined}
        />
      )}

      {/* Folder map controls + treemap */}
      <section className="panel" data-storage-ui="mock-v1">
        <div className="panel-header flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="panel-title">Folder map</p>
            <p className="panel-subtitle">
              Pick a disk or volume map, or set a folder root for a narrower
              map.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowTips((v) => !v)}
            className="inline-flex items-center gap-1.5 self-start rounded-control border border-hairline px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
          >
            <Lightbulb className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Tips
          </button>
        </div>

        <div className="panel-body space-y-4">
          {showTips ? (
            <div className="rounded-control border border-hairline bg-surface-elevated/60 px-3.5 py-3 text-xs leading-relaxed text-text-secondary">
              Volume maps are capped (~12s) so the UI stays responsive. Empty
              folder root uses the user profile. Build map for a narrow path;
              Volume map for the whole selected disk.
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-end">
            <div className="min-w-0 space-y-1.5">
              <label
                htmlFor="volume-map-root"
                className="text-2xs font-semibold uppercase tracking-wide text-text-muted"
              >
                Disk / Volume
              </label>
              <DriveSelect
                id="volume-map-root"
                value={volumeRoot}
                drives={drives}
                onChange={setVolumeRoot}
                disabled={mapping}
                className="field w-full min-w-0 font-mono"
              />
            </div>

            <div className="min-w-0 space-y-1.5">
              <label
                htmlFor="folder-map-root"
                className="text-2xs font-semibold uppercase tracking-wide text-text-muted"
              >
                Root folder{' '}
                <span className="font-normal normal-case tracking-normal text-text-ash">
                  (optional)
                </span>
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
                className="field w-full min-w-0 font-mono"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                loading={mapping}
                onClick={handleBuildMap}
              >
                <Folder className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                {mapping ? 'Building…' : 'Build map'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={mapping}
                onClick={handleVolumeMap}
              >
                <HardDrive
                  className="h-3.5 w-3.5"
                  strokeWidth={1.75}
                  aria-hidden
                />
                {mapping
                  ? 'Building…'
                  : `Volume map (${volumeRoot.replace(/\\$/, '') || 'disk'})`}
              </Button>
            </div>
          </div>

          {mapping && !folderMap ? (
            <div className="flex items-center justify-center py-8">
              <Spinner label="Building folder map…" />
            </div>
          ) : !folderMap ? (
            <p className="text-sm text-text-muted">
              Build a map or volume map to see relative folder sizes.
            </p>
          ) : (
            <div className="space-y-3 border-t border-hairline pt-4">
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
                  <DiskTreemap root={folderMap} height={280} />
                  <ul className="max-h-64 space-y-2 overflow-y-auto scrollbar-thin">
                    {folderChildren.map((child) => (
                      <FolderMapRow
                        key={child.path}
                        node={child}
                        depth={0}
                      />
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {(preview || cleanupResult) && (
        <section className="panel">
          <div className="panel-header">
            <p className="panel-title">Safe cleanup</p>
            <p className="panel-subtitle">
              Preview and results from temp/cache cleanup
            </p>
          </div>
          <div className="panel-body space-y-3">
            {preview && (
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {preview.title}
                </p>
                {preview.detail ? (
                  <p className="mt-1 text-sm text-text-secondary">
                    {preview.detail}
                  </p>
                ) : null}
                {preview.preview ? (
                  <pre className="mt-2 max-h-40 overflow-auto rounded border border-hairline bg-surface-elevated p-3 text-2xs text-text-secondary scrollbar-thin">
                    {preview.preview}
                  </pre>
                ) : null}
                <p className="mt-2 text-2xs text-text-muted">
                  Status: {preview.status}
                  {preview.finishedAt
                    ? ` · ${formatTimestamp(preview.finishedAt)}`
                    : ` · ${formatTimestamp(preview.createdAt)}`}
                </p>
              </div>
            )}
            {cleanupResult ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
            ) : null}
            {cleanupResult && cleanupResult.errors.length > 0 ? (
              <ul className="list-inside list-disc text-2xs text-status-error">
                {cleanupResult.errors.slice(0, 5).map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      )}

      {loading && !scan ? (
        <div className="flex items-center justify-center py-16">
          <Spinner label="Loading storage…" />
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
          <ScanStatRow scan={scan} />

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
            <CategoryBreakdownPanel
              rows={categoryBreakdown}
              maxBytes={maxCategoryBytes}
            />
            <LargestFilesPanel
              totalCount={largeFiles.length}
              pageItems={pageLargeFiles}
              pagination={largeFilePages}
            />
          </div>
        </>
      )}

      {!tipDismissed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hairline bg-surface-card px-panel-x py-3 shadow-card">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-text-secondary">
            <Lightbulb
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning"
              strokeWidth={1.75}
              aria-hidden
            />
            <span>
              <span className="font-semibold text-text-primary">Tip: </span>
              Regular cleanup keeps your system fast and free up space.
            </span>
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                void handlePreviewCleanup();
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
            >
              Learn more
              <ExternalLink className="h-3 w-3" strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setTipDismissed(true)}
              className="rounded p-1 text-text-muted hover:bg-surface-elevated hover:text-text-primary"
              aria-label="Dismiss tip"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

/** True when `path` lives on the given Windows/Unix volume root. */
function pathOnDrive(path: string, driveName: string): boolean {
  const p = path.trim().replace(/\//g, '\\').toLowerCase();
  const d = driveName.trim().replace(/\//g, '\\').toLowerCase();
  if (!p || !d) return false;
  // "c:\" matches "c:\users\..." ; also "c:" without slash
  const root = d.endsWith('\\') ? d : `${d}\\`;
  const rootBare = root.slice(0, -1);
  return p === rootBare || p === root || p.startsWith(root);
}

function VolumeHero({
  drive,
  selected,
  folderMap,
  categoryBreakdown,
  onSelect,
}: {
  drive: LogicalDrive | null;
  selected: boolean;
  folderMap: StorageFolderNode | null;
  categoryBreakdown: Array<{ category: string; bytes: number }>;
  onSelect?: () => void;
}) {
  const total = drive?.totalBytes && drive.totalBytes > 0 ? drive.totalBytes : 0;
  const free =
    drive?.availableBytes != null && Number.isFinite(drive.availableBytes)
      ? Math.max(0, drive.availableBytes)
      : 0;
  const used = total > 0 ? Math.max(0, total - free) : 0;
  const freePct = total > 0 ? (free / total) * 100 : 0;
  const usedPct = total > 0 ? (used / total) * 100 : 0;

  const hasClassifiedBreakdown =
    folderMap !== null || categoryBreakdown.length > 0;

  const breakdown = useMemo(
    () =>
      hasClassifiedBreakdown
        ? buildVolumeBreakdown(used, folderMap, categoryBreakdown)
        : null,
    [hasClassifiedBreakdown, used, folderMap, categoryBreakdown],
  );

  const segments = breakdown
    ? (['system', 'apps', 'files', 'other'] as VolumeBucket[]).map((key) => {
        const bytes = breakdown[key];
        const pctOfUsed = used > 0 ? (bytes / used) * 100 : 0;
        const pctOfTotal = total > 0 ? (bytes / total) * 100 : 0;
        return { key, bytes, pctOfUsed, pctOfTotal };
      })
    : null;

  const mediaBadge = drive?.isRemovable
    ? 'Removable'
    : drive?.fileSystem?.trim()
      ? drive.fileSystem.trim()
      : drive
        ? 'Fixed'
        : null;

  const volumeKey = drive?.name ?? 'unknown';
  const gradientId = `storage-used-grad-${volumeKey.replace(/[^a-zA-Z0-9]/g, '')}`;

  const body = (
    <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:gap-6 lg:p-6">
      {/* Drive identity */}
      <div className="flex min-w-[9rem] items-start gap-3 lg:w-44 lg:shrink-0">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface-elevated text-text-muted">
          <HardDrive className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-semibold text-text-primary">
              {driveDisplayName(drive ?? undefined, drive?.name ?? 'C:\\')}
            </p>
            {mediaBadge ? (
              <span className="rounded border border-hairline bg-surface-elevated px-1.5 py-px text-2xs font-semibold uppercase tracking-wide text-text-muted">
                {mediaBadge}
              </span>
            ) : null}
            {selected ? (
              <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-px text-2xs font-semibold text-accent">
                Selected
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-text-primary cause-semibold">
            {total > 0 ? formatBytes(total) : '—'}
          </p>
          <p className="mt-0.5 text-2xs text-text-muted">Total capacity</p>
        </div>
      </div>

      {/* Free + composition bar */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-2xl font-semibold tabular-nums tracking-tight text-status-success cause-semibold">
              {total > 0 ? formatBytes(free) : '—'}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-text-muted">Free space</span>
              {total > 0 ? (
                <span className="rounded-full border border-status-success/30 bg-status-success-bg px-2 py-px text-2xs font-semibold text-status-success">
                  {Math.round(freePct)}% free
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {total > 0 ? (
          <>
            <div
              className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
              role="img"
              aria-label="Disk space composition"
            >
              {segments ? (
                segments.map((seg) =>
                  seg.pctOfTotal > 0.15 ? (
                    <div
                      key={seg.key}
                      className="h-full first:rounded-l-full last:rounded-r-full"
                      style={{
                        width: `${seg.pctOfTotal}%`,
                        backgroundColor: VOLUME_META[seg.key].color,
                      }}
                      title={`${VOLUME_META[seg.key].label}: ${formatBytes(seg.bytes)}`}
                    />
                  ) : null,
                )
              ) : (
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${usedPct}%`,
                    background:
                      'linear-gradient(90deg, #5b9dff 0%, #a78bfa 55%, #f5a623 100%)',
                  }}
                  title={`Used: ${formatBytes(used)}`}
                />
              )}
            </div>

            {segments ? (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                {segments.map((seg) => (
                  <div key={seg.key} className="flex items-center gap-1.5">
                    <span
                      className={[
                        'h-2 w-2 shrink-0 rounded-full',
                        VOLUME_META[seg.key].swatch,
                      ].join(' ')}
                      aria-hidden
                    />
                    <span className="text-2xs text-text-muted">
                      {VOLUME_META[seg.key].label}
                    </span>
                    <span className="text-2xs tabular-nums text-text-secondary">
                      {formatBytes(seg.bytes)}{' '}
                      <span className="text-text-ash">
                        {Math.round(seg.pctOfUsed)}%
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-[#a78bfa]"
                    aria-hidden
                  />
                  <span className="text-2xs text-text-muted">Used</span>
                  <span className="text-2xs tabular-nums text-text-secondary">
                    {formatBytes(used)}{' '}
                    <span className="text-text-ash">
                      {Math.round(usedPct)}%
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-white/20"
                    aria-hidden
                  />
                  <span className="text-2xs text-text-muted">Free</span>
                  <span className="text-2xs tabular-nums text-text-secondary">
                    {formatBytes(free)}{' '}
                    <span className="text-text-ash">
                      {Math.round(freePct)}%
                    </span>
                  </span>
                </div>
                <span className="text-2xs text-text-ash">
                  Run volume map for category breakdown
                </span>
              </div>
            )}
          </>
        ) : (
          <p className="mt-3 text-xs text-text-muted">
            Waiting for drive list to load capacity details.
          </p>
        )}
      </div>

      <UsageDonut
        gradientId={gradientId}
        usedPct={usedPct}
        usedBytes={used}
        hasData={total > 0}
      />
    </div>
  );

  if (onSelect && drive) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={[
          'panel w-full overflow-hidden text-left transition-colors',
          selected
            ? 'ring-1 ring-accent/40'
            : 'hover:border-white/10 hover:bg-surface-elevated/20',
        ].join(' ')}
        aria-pressed={selected}
        aria-label={`Select ${driveDisplayName(drive, drive.name)} for folder map`}
      >
        {body}
      </button>
    );
  }

  return <section className="panel overflow-hidden">{body}</section>;
}

function UsageDonut({
  gradientId,
  usedPct,
  usedBytes,
  hasData,
}: {
  gradientId: string;
  usedPct: number;
  usedBytes: number;
  hasData: boolean;
}) {
  const size = 108;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = hasData ? Math.min(Math.max(usedPct, 0), 100) : 0;
  const offset = c * (1 - clamped / 100);

  return (
    <div
      className="relative mx-auto shrink-0 lg:mx-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        hasData
          ? `${Math.round(clamped)} percent used, ${formatBytes(usedBytes)}`
          : 'Usage unknown'
      }
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-full w-full -rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#5b9dff" />
            <stop offset="55%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#f5a623" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold tabular-nums tracking-tight text-text-primary cause-semibold">
          {hasData ? `${Math.round(clamped)}%` : '—'}
        </span>
        <span className="text-2xs font-medium text-text-muted">Used</span>
        <span className="text-2xs tabular-nums text-text-secondary">
          {hasData ? formatBytes(usedBytes) : ''}
        </span>
      </div>
    </div>
  );
}

function ScanStatRow({ scan }: { scan: StorageScan }) {
  const statusLower = scan.status.toLowerCase();
  const completed =
    statusLower === 'completed' ||
    statusLower === 'success' ||
    statusLower === 'done';

  const tiles = [
    {
      key: 'bytes',
      label: 'Total scanned',
      value: formatBytes(scan.totalBytes),
      icon: HardDrive,
      iconClass: 'text-[#5b9dff] bg-[#5b9dff]/15',
      valueClass: 'text-text-primary',
      hint: null as string | null,
    },
    {
      key: 'files',
      label: 'Files',
      value: scan.fileCount.toLocaleString(),
      icon: File,
      iconClass: 'text-[#5b9dff] bg-[#5b9dff]/15',
      valueClass: 'text-text-primary',
      hint: null,
    },
    {
      key: 'dirs',
      label: 'Directories',
      value: scan.dirCount.toLocaleString(),
      icon: Folder,
      iconClass: 'text-[#a78bfa] bg-[#a78bfa]/15',
      valueClass: 'text-text-primary',
      hint: null,
    },
    {
      key: 'status',
      label: completed ? 'Completed' : scan.status,
      value: completed ? 'Completed' : scan.status,
      icon: CheckCircle2,
      iconClass: completed
        ? 'text-status-success bg-status-success-bg'
        : 'text-text-muted bg-surface-elevated',
      valueClass: completed ? 'text-status-success' : 'text-text-primary',
      hint: scan.finishedAt
        ? formatTimestamp(scan.finishedAt)
        : formatTimestamp(scan.createdAt),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <div
            key={tile.key}
            className="flex items-center gap-3 rounded-card border border-hairline bg-surface-card px-panel-x py-panel-y shadow-card"
          >
            <span
              className={[
                'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                tile.iconClass,
              ].join(' ')}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              {tile.key === 'status' ? (
                <>
                  <p
                    className={[
                      'text-sm font-semibold capitalize',
                      tile.valueClass,
                    ].join(' ')}
                  >
                    {tile.value}
                  </p>
                  {tile.hint ? (
                    <p className="mt-0.5 text-2xs text-text-muted">
                      {tile.hint}
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <p
                    className={[
                      'text-sm font-semibold tabular-nums tracking-tight cause-semibold',
                      tile.valueClass,
                    ].join(' ')}
                  >
                    {tile.value}
                  </p>
                  <p className="mt-0.5 text-2xs text-text-muted">{tile.label}</p>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CategoryBreakdownPanel({
  rows,
  maxBytes,
}: {
  rows: Array<{ category: string; count: number; bytes: number }>;
  maxBytes: number;
}) {
  const preview = rows.slice(0, 5);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : preview;

  return (
    <section className="panel min-w-0">
      <div className="panel-header">
        <p className="panel-title">Category breakdown</p>
        <p className="panel-subtitle">By size in this scan</p>
      </div>
      <div className="panel-body space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-text-muted">
            No categorized items in this scan.
          </p>
        ) : (
          <>
            <ul className="space-y-3">
              {visible.map((row) => {
                const style = categoryStyle(row.category);
                const Icon = style.icon;
                const width =
                  maxBytes > 0
                    ? Math.max(4, (row.bytes / maxBytes) * 100)
                    : 0;
                return (
                  <li key={row.category}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span
                          className={[
                            'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                            style.iconBg,
                            style.iconFg,
                          ].join(' ')}
                        >
                          <Icon
                            className="h-3.5 w-3.5"
                            strokeWidth={1.75}
                            aria-hidden
                          />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-primary">
                            {categoryLabel(row.category)}
                          </p>
                          <p className="text-2xs text-text-muted">
                            {row.count.toLocaleString()} item
                            {row.count === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums text-text-secondary">
                        {formatBytes(row.bytes)}
                      </span>
                    </div>
                    <div className="mt-1.5 ml-9 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className={['h-full rounded-full', style.bar].join(' ')}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            {rows.length > 5 ? (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="flex w-full items-center justify-between border-t border-hairline pt-3 text-xs font-medium text-text-secondary hover:text-text-primary"
              >
                {showAll ? 'Show less' : 'View full breakdown'}
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function LargestFilesPanel({
  totalCount,
  pageItems,
  pagination,
}: {
  totalCount: number;
  pageItems: StorageItem[];
  pagination: ReturnType<typeof usePaginatedItems<StorageItem>>['pagination'];
}) {
  return (
    <section className="panel min-w-0">
      <div className="panel-header flex items-center justify-between gap-3">
        <div>
          <p className="panel-title">Largest files</p>
          <p className="panel-subtitle">
            {totalCount.toLocaleString()} file{totalCount === 1 ? '' : 's'} ·{' '}
            {DEFAULT_PAGE_SIZE} per page
          </p>
        </div>
      </div>
      {totalCount === 0 ? (
        <EmptyState
          heading="No files found"
          body="This scan did not return file-level items."
        />
      ) : (
        <>
          <ul className="divide-y divide-hairline">
            {pageItems.map((item) => (
              <LargestFileRow key={item.id} item={item} />
            ))}
          </ul>
          <Pagination pagination={pagination} itemLabel="files" />
        </>
      )}
    </section>
  );
}

function LargestFileRow({ item }: { item: StorageItem }) {
  const Icon = fileIcon(item.name);
  return (
    <li className="flex items-center gap-3 px-panel-x py-3">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-elevated text-text-muted">
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-medium text-text-primary"
          title={item.path}
        >
          {item.name}
        </p>
        <p
          className="truncate font-mono text-2xs text-text-muted"
          title={item.path}
        >
          {item.path}
        </p>
      </div>
      <span className="hidden shrink-0 text-xs text-text-muted sm:inline">
        {categoryLabel(item.category)}
      </span>
      <span className="shrink-0 text-sm tabular-nums text-text-secondary">
        {formatBytes(item.sizeBytes)}
      </span>
    </li>
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
          'w-full rounded-control border border-hairline bg-surface-elevated/40 px-3 py-2 text-left transition-colors',
          hasChildren ? 'cursor-pointer hover:bg-surface-elevated' : 'cursor-default',
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
              {hasChildren ? (expanded ? '− ' : '+ ') : ''}
              {node.name}
            </p>
            <p className="text-2xs text-text-muted">
              {node.fileCount.toLocaleString()} files · {pct.toFixed(1)}% of
              parent
            </p>
          </div>
          <span className="shrink-0 text-sm tabular-nums text-text-secondary">
            {formatBytes(node.sizeBytes)}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-accent/70"
            style={{ width: `${pct}%` }}
            role="presentation"
          />
        </div>
      </button>
      {hasChildren && expanded ? (
        <ul className="mt-2 space-y-2">
          {node.children.map((child) => (
            <FolderMapRow key={child.path} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
