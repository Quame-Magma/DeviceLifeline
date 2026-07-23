import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Box,
  ChevronRight,
  ClipboardList,
  FileText,
  FolderOpen,
  Gauge,
  Globe,
  HardDrive,
  Image,
  Layers,
  MoreHorizontal,
  Percent,
  Recycle,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCleanup } from '../hooks/use-cleanup';
import { usePaginatedItems } from '../hooks/use-pagination';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Pagination } from '../components/common/Pagination';
import { Spinner } from '../components/common/Spinner';
import { PageShell } from '../components/layout/PageShell';
import { confirmAction, toast, toastInfo } from '../lib/feedback';
import { formatBytes } from '../lib/format';
import type { CleanupCategorySummary } from '../types/device.types';

/**
 * Cleanup — redesigned to ChatGPT mock:
 * 4 metric tiles, filterable category list with icons, evidence sample table,
 * safe-by-default footer.
 */
export function CleanupCenter() {
  const {
    preview,
    result,
    selected,
    loading,
    acting,
    error,
    scan,
    toggleCategory,
    selectAll,
    selectSafeOnly,
    execute,
  } = useCleanup();

  const [categoryQuery, setCategoryQuery] = useState('');
  const [showAllEvidence, setShowAllEvidence] = useState(false);

  useEffect(() => {
    void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial scan only
  }, []);

  const categories = useMemo(() => {
    const list = preview?.categories ?? [];
    const q = categoryQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) =>
      [c.id, c.label, c.description, c.risk]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [preview?.categories, categoryQuery]);

  const selectedCandidates = useMemo(() => {
    const candidates = preview?.candidates ?? [];
    if (selected.size === 0) return candidates;
    return candidates.filter((c) => selected.has(c.category));
  }, [preview?.candidates, selected]);

  const { pageItems, pagination } = usePaginatedItems(selectedCandidates);

  const selectedBytes = useMemo(() => {
    if (!preview) return 0;
    return preview.categories
      .filter((c) => selected.has(c.id))
      .reduce((s, c) => s + c.totalBytes, 0);
  }, [preview, selected]);

  const selectedItemCount = useMemo(() => {
    if (!preview) return 0;
    return preview.categories
      .filter((c) => selected.has(c.id))
      .reduce((s, c) => s + c.itemCount, 0);
  }, [preview, selected]);

  const potentialFreedomPct = useMemo(() => {
    const total = preview?.totalBytes ?? 0;
    if (total <= 0) return 0;
    return Math.min(100, (selectedBytes / total) * 100);
  }, [preview?.totalBytes, selectedBytes]);

  const lastResultKey = useRef<string | null>(null);
  const lastErrorKey = useRef<string | null>(null);

  useEffect(() => {
    if (!result) return;
    const key = `${result.deletedCount}-${result.deletedBytes}-${result.failedCount}-${result.action.resultMessage}`;
    if (lastResultKey.current === key) return;
    lastResultKey.current = key;

    const detail = [
      result.action.resultMessage,
      result.failedCount > 0
        ? `${result.failedCount} item(s) failed or were locked.`
        : null,
      result.errors?.[0] ? `Example: ${result.errors[0]}` : null,
      result.categoriesCleaned?.length
        ? `Categories: ${result.categoriesCleaned.join(', ')}`
        : null,
    ]
      .filter(Boolean)
      .join(' ');

    if (
      result.deletedCount > 0 &&
      result.failedCount === 0 &&
      (result.remainingPaths?.length ?? 0) === 0
    ) {
      toast({
        title: `Cleaned ${result.deletedCount} item(s)`,
        description: `${formatBytes(result.deletedBytes)} freed. ${detail}`.trim(),
        tone: 'success',
        duration: 7000,
      });
    } else {
      toast({
        title:
          result.deletedCount > 0
            ? 'Cleanup partially verified'
            : 'Cleanup finished — nothing removed',
        description: detail || 'Selected targets were empty or already clean.',
        tone: 'warning',
        duration: 6500,
      });
    }
  }, [result]);

  useEffect(() => {
    if (!error) return;
    if (lastErrorKey.current === error) return;
    lastErrorKey.current = error;
    toast({
      title: 'Cleanup issue',
      description: error,
      tone: 'warning',
    });
  }, [error]);

  const handleExecute = async () => {
    const privacy = preview?.categories.filter(
      (c) =>
        selected.has(c.id) && (c.risk === 'privacy' || c.risk === 'advanced'),
    );
    const privacyNote =
      privacy && privacy.length > 0
        ? `\n\nIncludes privacy/advanced categories: ${privacy.map((c) => c.label).join(', ')}.\nClose browsers first if cleaning history or cookies.`
        : '';

    const ok = await confirmAction({
      title: 'Clean selected categories?',
      description:
        `About ${selectedItemCount} item(s) across ${selected.size} categor${selected.size === 1 ? 'y' : 'ies'} (~${formatBytes(selectedBytes)}).` +
        privacyNote +
        `\n\nDocuments and Desktop are never deleted.`,
      confirmLabel: 'Clean selected',
      tone: privacy && privacy.length > 0 ? 'warning' : 'primary',
    });
    if (!ok) return;
    toast({
      title: 'Cleaning…',
      description: 'This can take up to a minute. Leave the app open.',
      tone: 'info',
      duration: 4000,
    });
    void execute();
  };

  const evidenceCount = selectedCandidates.length;
  /** Cap expanded list so huge scans stay responsive. */
  const expandedEvidence = useMemo(
    () => selectedCandidates.slice(0, 100),
    [selectedCandidates],
  );

  return (
    <PageShell
      title="Cleanup"
      description="Temp, caches, browser data, Recycle Bin, and Windows junk."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={loading}
            onClick={() => void scan()}
          >
            {!loading ? (
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
            ) : null}
            Scan
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!preview}
            onClick={selectSafeOnly}
          >
            Safe only
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!preview}
            onClick={selectAll}
          >
            Select all
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={acting}
            disabled={!preview || selected.size === 0}
            onClick={() => {
              void handleExecute();
            }}
          >
            Clean selected
          </Button>
        </div>
      }
    >
      {acting ? (
        <div className="flex items-center gap-3 rounded-card border border-hairline bg-surface-elevated px-panel-x py-panel-y text-sm text-text-secondary">
          <Spinner size="sm" label="Cleaning" />
          <span>
            Cleaning selected categories… this can take up to a minute. Leave
            the app open.
          </span>
        </div>
      ) : null}

      {/* Metric strip — 4 tiles */}
      <div
        className="grid grid-cols-2 gap-2 xl:grid-cols-4"

      >
        <MetricTile
          icon={ClipboardList}
          iconClass="bg-sky-500/15 text-sky-400"
          label="Items found"
          value={(preview?.totalCount ?? 0).toLocaleString()}
          hint="Files & entries"
          hintClass="text-sky-400"
        />
        <MetricTile
          icon={Gauge}
          iconClass="bg-status-success/15 text-status-success"
          label="Total size"
          value={formatBytes(preview?.totalBytes ?? 0)}
          hint="Space found"
          hintClass="text-status-success"
        />
        <MetricTile
          icon={Layers}
          iconClass="bg-purple-500/20 text-purple-300"
          label="Selected size"
          value={formatBytes(selectedBytes)}
          hint="Space selected"
          hintClass="text-purple-300"
        />
        <MetricTile
          icon={Percent}
          iconClass="bg-status-warning/15 text-status-warning"
          label="Potential freedom"
          value={`${potentialFreedomPct.toFixed(1)}%`}
          hint="Of scan space"
          hintClass="text-status-warning"
        />
      </div>

      {/* Categories */}
      <section className="panel overflow-hidden">
        <div className="panel-header flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="panel-title">Categories</p>
            <p className="panel-subtitle">
              Safe = default · Privacy/advanced = opt-in
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="relative block min-w-[12rem] flex-1 sm:min-w-[16rem]">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
                strokeWidth={1.75}
                aria-hidden
              />
              <input
                type="search"
                value={categoryQuery}
                onChange={(e) => setCategoryQuery(e.target.value)}
                placeholder="Filter categories…"
                className="field w-full pl-8 text-xs"
                aria-label="Filter categories"
              />
            </label>
          </div>
        </div>

        {loading && !preview ? (
          <div className="flex justify-center py-12">
            <Spinner label="Scanning safe cleanup targets…" />
          </div>
        ) : !preview || preview.categories.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-8 w-8" strokeWidth={1.75} />}
            heading="Nothing to clean"
            body="Scan again after using the PC — temp and cache fill over time."
          />
        ) : categories.length === 0 ? (
          <p className="panel-body text-sm text-text-secondary">
            No categories match “{categoryQuery}”.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {categories.map((cat) => (
              <CategoryRow
                key={cat.id}
                category={cat}
                checked={selected.has(cat.id)}
                onToggle={() => toggleCategory(cat.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Evidence */}
      <section className="panel overflow-hidden">
        <div className="panel-header flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="panel-title">Evidence (sample files)</p>
            <p className="panel-subtitle">
              What would be deleted from selected categories
            </p>
          </div>
          {evidenceCount > 0 ? (
            <button
              type="button"
              className="text-xs font-medium text-sky-400 hover:text-sky-300"
              onClick={() => setShowAllEvidence((v) => !v)}
            >
              {showAllEvidence
                ? 'Paginate'
                : `View all (${evidenceCount.toLocaleString()})`}
            </button>
          ) : null}
        </div>

        {evidenceCount === 0 ? (
          <p className="panel-body text-sm text-text-secondary">
            No file-level candidates in the selected categories.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Path</th>
                    <th className="text-right">Size</th>
                    <th className="w-10">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(showAllEvidence ? expandedEvidence : pageItems).map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="inline-flex items-center gap-2 text-xs text-text-secondary">
                          <FileText
                            className="h-3.5 w-3.5 shrink-0 text-text-muted"
                            strokeWidth={1.75}
                            aria-hidden
                          />
                          <span className="font-mono text-2xs">
                            {c.category}
                          </span>
                        </span>
                      </td>
                      <td>
                        <span
                          className="block max-w-[min(52vw,520px)] truncate font-mono text-2xs text-text-secondary"
                          title={c.path}
                        >
                          {c.path}
                        </span>
                      </td>
                      <td className="text-right tabular-nums text-text-secondary">
                        {formatBytes(c.sizeBytes)}
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-surface-elevated hover:text-text-primary"
                          aria-label={`Copy path ${c.path}`}
                          title="Copy path"
                          onClick={() => {
                            void navigator.clipboard
                              .writeText(c.path)
                              .then(() =>
                                toastInfo('Path copied to clipboard'),
                              )
                              .catch(() =>
                                toastInfo(c.path),
                              );
                          }}
                        >
                          <MoreHorizontal
                            className="h-4 w-4"
                            strokeWidth={1.75}
                          />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!showAllEvidence ? (
              <Pagination pagination={pagination} itemLabel="files" />
            ) : (
              <p className="border-t border-hairline px-panel-x py-2.5 text-2xs text-text-muted">
                Showing first {Math.min(100, evidenceCount).toLocaleString()} of{' '}
                {evidenceCount.toLocaleString()} file
                {evidenceCount === 1 ? '' : 's'} — use Paginate for full list
              </p>
            )}
          </>
        )}
      </section>

      {/* Safe by default footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hairline bg-surface-card px-panel-x py-3 shadow-card">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-status-success/15 text-status-success">
            <ShieldCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">
              Safe by default
            </p>
            <p className="text-2xs text-text-secondary">
              We only remove files that are safe to delete. You can review
              everything before cleaning.
            </p>
          </div>
        </div>
        <p className="max-w-xs text-right text-2xs text-text-muted">
          Privacy &amp; advanced categories stay opt-in (history, cookies,
          Prefetch, registry MRU).
        </p>
      </div>
    </PageShell>
  );
}

function MetricTile({
  icon: Icon,
  iconClass,
  label,
  value,
  hint,
  hintClass,
}: {
  icon: LucideIcon;
  iconClass: string;
  label: string;
  value: string;
  hint: string;
  hintClass?: string;
}) {
  return (
    <div className="relative flex min-h-[5.25rem] items-start justify-between gap-3 overflow-hidden rounded-card border border-hairline bg-surface-card px-panel-x py-panel-y shadow-card">
      <div className="min-w-0">
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
      <span
        className={[
          'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          iconClass,
        ].join(' ')}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </span>
    </div>
  );
}

function categoryVisual(id: string): {
  icon: LucideIcon;
  iconClass: string;
} {
  switch (id) {
    case 'user_temp':
    case 'windows_temp':
    case 'user_cache':
      return {
        icon: FolderOpen,
        iconClass: 'bg-status-success/15 text-status-success',
      };
    case 'browser_cache':
    case 'inet_cache':
    case 'browser_history':
    case 'browser_cookies':
    case 'browser_sessions':
    case 'browser_form_data':
      return {
        icon: Globe,
        iconClass: 'bg-sky-500/15 text-sky-400',
      };
    case 'windows_defender_history':
      return {
        icon: Shield,
        iconClass: 'bg-status-warning/15 text-status-warning',
      };
    case 'thumbnail_cache':
      return {
        icon: Image,
        iconClass: 'bg-purple-500/20 text-purple-300',
      };
    case 'notification_history':
      return {
        icon: Bell,
        iconClass: 'bg-status-warning/15 text-status-warning',
      };
    case 'directx_shader_cache':
    case 'font_cache':
      return {
        icon: Box,
        iconClass: 'bg-cyan-500/15 text-cyan-400',
      };
    case 'recycle_bin':
      return {
        icon: Recycle,
        iconClass: 'bg-status-success/15 text-status-success',
      };
    case 'memory_dumps':
    case 'windows_error_reports':
    case 'windows_logs':
      return {
        icon: FileText,
        iconClass: 'bg-text-muted/15 text-text-muted',
      };
    case 'delivery_optimization':
    case 'windows_update_cache':
    case 'windows_update_downloads':
      return {
        icon: HardDrive,
        iconClass: 'bg-sky-500/15 text-sky-400',
      };
    case 'prefetch':
    case 'registry_mru':
      return {
        icon: Layers,
        iconClass: 'bg-status-warning/15 text-status-warning',
      };
    case 'clipboard':
    case 'dns_cache':
      return {
        icon: Sparkles,
        iconClass: 'bg-status-success/15 text-status-success',
      };
    case 'recent_documents':
    case 'office_temp':
      return {
        icon: FileText,
        iconClass: 'bg-purple-500/20 text-purple-300',
      };
    default:
      return {
        icon: Trash2,
        iconClass: 'bg-surface-elevated text-text-muted',
      };
  }
}

function CategoryRow({
  category,
  checked,
  onToggle,
}: {
  category: CleanupCategorySummary;
  checked: boolean;
  onToggle: () => void;
}) {
  const { icon: Icon, iconClass } = categoryVisual(category.id);
  const inputId = `clean-${category.id}`;

  return (
    <li>
      <label
        htmlFor={inputId}
        className="flex cursor-pointer items-center gap-3 px-panel-x py-3 text-sm transition-colors hover:bg-surface-elevated/35"
      >
        <input
          id={inputId}
          type="checkbox"
          className="h-4 w-4 shrink-0 rounded border-hairline accent-sky-500"
          checked={checked}
          onChange={onToggle}
        />
        <span
          className={[
            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            iconClass,
          ].join(' ')}
        >
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-text-primary">
              {category.label}
            </span>
            {category.risk !== 'safe' ? (
              <span className="rounded bg-status-warning/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-warning">
                {category.risk}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-2xs text-text-muted">
            {category.description}
          </span>
        </span>
        <span className="hidden shrink-0 tabular-nums text-2xs text-text-muted sm:inline">
          {category.itemCount.toLocaleString()}{' '}
          {category.itemCount === 1 ? 'file' : 'files'}
        </span>
        <span className="w-16 shrink-0 text-right text-sm font-medium tabular-nums text-text-primary sm:w-20">
          {formatBytes(category.totalBytes)}
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-text-muted"
          strokeWidth={1.75}
          aria-hidden
        />
      </label>
    </li>
  );
}
