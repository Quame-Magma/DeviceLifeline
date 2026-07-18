import { useEffect, useMemo, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { useCleanup } from '../hooks/use-cleanup';
import { usePaginatedItems } from '../hooks/use-pagination';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Pagination } from '../components/common/Pagination';
import { Spinner } from '../components/common/Spinner';
import { StatRow, StatTile } from '../components/common/StatTile';
import { PageShell } from '../components/layout/PageShell';
import { confirmAction, toast } from '../lib/feedback';
import { formatBytes } from '../lib/format';

/**
 * Classic CCleaner-class cleanup: temp/cache, browser privacy, Windows junk,
 * Recycle Bin, DNS, clipboard, and registry MRU (not a junk registry scanner).
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

  useEffect(() => {
    void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial scan only
  }, []);

  const filtered = useMemo(() => {
    const candidates = preview?.candidates ?? [];
    if (selected.size === 0) return candidates;
    return candidates.filter((c) => selected.has(c.category));
  }, [preview?.candidates, selected]);

  const { pageItems, pagination } = usePaginatedItems(filtered);

  const selectedBytes = useMemo(() => {
    return filtered.reduce((s, c) => s + c.sizeBytes, 0);
  }, [filtered]);

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

    if (result.deletedCount > 0) {
      toast({
        title: `Cleaned ${result.deletedCount} item(s)`,
        description:
          `${formatBytes(result.deletedBytes)} freed. ${detail}`.trim(),
        tone: 'success',
        duration: 7000,
      });
    } else {
      toast({
        title: 'Cleanup finished — nothing removed',
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
        `About ${filtered.length} item(s) across ${selected.size} categor${selected.size === 1 ? 'y' : 'ies'} (~${formatBytes(selectedBytes)}).` +
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

  return (
    <PageShell
      title="Cleanup"
      description="Temp, caches, browser data, Recycle Bin, and Windows junk."
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            loading={loading}
            onClick={() => void scan()}
          >
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
        </>
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

      <StatRow columns={3}>
        <StatTile label="Items found" value={preview?.totalCount ?? 0} />
        <StatTile
          label="Total size"
          value={formatBytes(preview?.totalBytes ?? 0)}
        />
        <StatTile label="Selected size" value={formatBytes(selectedBytes)} />
      </StatRow>

      <section className="panel">
        <div className="panel-header">
          <p className="panel-title">Categories</p>
          <p className="panel-subtitle">
            Safe = default · Privacy/advanced = opt-in (history, cookies,
            Prefetch, registry MRU)
          </p>
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
        ) : (
          <ul className="divide-y divide-hairline">
            {preview.categories.map((cat) => (
              <li
                key={cat.id}
                className="flex items-start gap-3 px-panel-x py-3 text-sm"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.has(cat.id)}
                  onChange={() => toggleCategory(cat.id)}
                  id={`clean-${cat.id}`}
                />
                <label htmlFor={`clean-${cat.id}`} className="min-w-0 flex-1">
                  <span className="font-medium text-text-primary">
                    {cat.label}
                    {cat.risk !== 'safe' ? (
                      <span className="ml-2 text-2xs font-normal uppercase tracking-wide text-status-warning">
                        {cat.risk}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-2xs text-text-muted">
                    {cat.description}
                  </span>
                </label>
                <span className="shrink-0 tabular-nums text-text-secondary">
                  {cat.itemCount} · {formatBytes(cat.totalBytes)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <p className="panel-title">Evidence (sample files)</p>
          <p className="panel-subtitle">
            What would be deleted from selected categories
          </p>
        </div>
        {filtered.length === 0 ? (
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
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((c) => (
                    <tr key={c.id}>
                      <td className="text-xs">{c.category}</td>
                      <td>
                        <span
                          className="block max-w-[420px] truncate font-mono text-2xs"
                          title={c.path}
                        >
                          {c.path}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">
                        {formatBytes(c.sizeBytes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={pagination} itemLabel="files" />
          </>
        )}
      </section>
    </PageShell>
  );
}
