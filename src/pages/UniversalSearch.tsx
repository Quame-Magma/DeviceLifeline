import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { FolderSearch } from 'lucide-react';
import { useSearch } from '../hooks/use-search';
import { usePaginatedItems } from '../hooks/use-pagination';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Pagination } from '../components/common/Pagination';
import { Spinner } from '../components/common/Spinner';
import { StatRow, StatTile } from '../components/common/StatTile';
import { StatusPill } from '../components/common/StatusPill';
import { formatTimestamp } from '../lib/format';
import type { SearchResult } from '../types/device.types';
import { PageShell } from '../components/layout/PageShell';

function entityLabel(entityType: string): string {
  const labels: Record<string, string> = {
    finding: 'Finding',
    software: 'Software',
    config: 'Config',
    crash: 'Crash',
    timeline: 'Timeline',
    process: 'Process',
    storage: 'Storage',
    file: 'File',
  };
  return labels[entityType] ?? entityType;
}

function backendLabel(backend: string | undefined): string {
  if (!backend || backend.trim().length === 0) return 'local_fts';
  return backend;
}

function isFileEntity(entityType: string): boolean {
  return entityType.toLowerCase() === 'file';
}

export function UniversalSearch() {
  const {
    results,
    query,
    fileIndexStatus,
    loading,
    rebuilding,
    error,
    search,
    rebuild,
    rebuildFileIndex,
    rebuildAll,
    rebuildUsn,
    loadFileIndexStatus,
  } = useSearch();
  const [draft, setDraft] = useState('');
  const [usnVolume, setUsnVolume] = useState('C:');

  useEffect(() => {
    void loadFileIndexStatus();
  }, [loadFileIndexStatus]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    void search(draft);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') submit();
  };

  const handleRebuildUsn = () => {
    const volume = usnVolume.trim();
    void rebuildUsn(volume.length > 0 ? volume : null);
  };

  const everythingAvailable = fileIndexStatus?.everythingAvailable === true;
  const searchBackend = backendLabel(fileIndexStatus?.searchBackend);
  const { pageItems, pagination } = usePaginatedItems(results);

  return (
    <PageShell
      title="Search"
      description="Findings, software, config, crashes, timeline, and indexed files."
    >
      {error ? (
        <AlertBanner title="Search unavailable" message={error} />
      ) : null}

      <form onSubmit={submit} className="panel p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <FolderSearch
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
              strokeWidth={1.75}
            />
            <input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search this device…"
              aria-label="Search query"
              className="field-lg pl-10"
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={loading}
            disabled={draft.trim().length === 0}
          >
            Search
          </Button>
        </div>
      </form>

      <StatRow columns={4}>
        <StatTile
          label="Files indexed"
          value={
            fileIndexStatus ? fileIndexStatus.fileCount.toLocaleString() : '…'
          }
        />
        <StatTile
          label="Roots"
          value={
            fileIndexStatus ? fileIndexStatus.rootCount.toLocaleString() : '…'
          }
        />
        <StatTile
          label="Everything"
          value={everythingAvailable ? 'On' : 'Off'}
        />
        <StatTile label="Backend" value={searchBackend} />
      </StatRow>

      <div className="panel flex flex-wrap items-center gap-2 px-panel-x py-3">
        <span className="mr-auto text-2xs text-text-muted">
          Built{' '}
          {fileIndexStatus?.lastBuiltAt
            ? formatTimestamp(fileIndexStatus.lastBuiltAt)
            : 'never'}
        </span>
        <Button
          variant="secondary"
          size="sm"
          loading={rebuilding}
          onClick={() => void rebuild()}
        >
          Metadata
        </Button>
        <Button
          variant="secondary"
          size="sm"
          loading={rebuilding}
          onClick={() => void rebuildFileIndex()}
        >
          Files
        </Button>
        <Button
          variant="secondary"
          size="sm"
          loading={rebuilding}
          onClick={() => void rebuildAll()}
        >
          All
        </Button>
        <input
          type="text"
          value={usnVolume}
          onChange={(e) => setUsnVolume(e.target.value)}
          aria-label="USN volume"
          className="field w-16 font-mono"
        />
        <Button
          variant="secondary"
          size="sm"
          loading={rebuilding}
          onClick={handleRebuildUsn}
        >
          USN
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Searching…" />
        </div>
      ) : query.trim().length === 0 ? (
        <EmptyState
          icon={<FolderSearch className="h-8 w-8" strokeWidth={1.75} />}
          heading="Search this device"
          body="Enter a term to search local findings, software, crashes, and files."
        />
      ) : results.length === 0 ? (
        <EmptyState
          heading="No results"
          body={`Nothing matched “${query}”. Try a broader term or rebuild indexes.`}
        />
      ) : (
        <section className="panel">
          <div className="panel-header">
            <p className="panel-title">
              {results.length} result{results.length === 1 ? '' : 's'}
            </p>
            <p className="panel-subtitle">for “{query}”</p>
          </div>
          <ul className="divide-y divide-hairline">
            {pageItems.map((hit) => (
              <SearchHitRow
                key={`${hit.entityType}-${hit.entityId}`}
                hit={hit}
              />
            ))}
          </ul>
          <Pagination pagination={pagination} itemLabel="results" />
        </section>
      )}
    </PageShell>
  );
}

function SearchHitRow({ hit }: { hit: SearchResult }) {
  const fileHit = isFileEntity(hit.entityType);
  return (
    <li className="px-4 py-3 hover:bg-surface-elevated">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-primary">
            {hit.title}
          </p>
          {hit.body ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">
              {hit.body}
            </p>
          ) : null}
        </div>
        <StatusPill tone={fileHit ? 'info' : 'neutral'}>
          {entityLabel(hit.entityType)}
        </StatusPill>
      </div>
    </li>
  );
}
