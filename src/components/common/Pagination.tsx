import type { PaginationState } from '../../hooks/use-pagination';
import { DEFAULT_PAGE_SIZE } from '../../hooks/use-pagination';

interface PaginationProps {
  pagination: PaginationState;
  /** Optional label e.g. "processes" */
  itemLabel?: string;
  className?: string;
}

/**
 * Fixed 5-per-page footer. No page-size selector — consistent app-wide.
 */
export function Pagination({
  pagination,
  itemLabel = 'items',
  className = '',
}: PaginationProps) {
  const {
    page,
    totalItems,
    totalPages,
    startIndex,
    endIndex,
    setPage,
    nextPage,
    prevPage,
    canNext,
    canPrev,
  } = pagination;

  if (totalItems === 0) {
    return null;
  }

  const rangeStart = totalItems === 0 ? 0 : startIndex + 1;

  return (
    <div
      className={[
        'flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-panel-x py-3',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <p className="text-xs text-text-muted">
        <span className="tabular-nums text-text-secondary">
          {rangeStart}–{endIndex}
        </span>
        {' of '}
        <span className="tabular-nums text-text-secondary">{totalItems}</span>
        {' '}
        {itemLabel}
        <span className="text-text-ash"> · {DEFAULT_PAGE_SIZE}/page</span>
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={prevPage}
          disabled={!canPrev}
          className="h-7 rounded-control border border-hairline px-2 text-xs text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          Prev
        </button>
        <span className="min-w-[4.5rem] text-center text-xs tabular-nums text-text-muted">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={nextPage}
          disabled={!canNext}
          className="h-7 rounded-control border border-hairline px-2 text-xs text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          Next
        </button>
        {totalPages > 5 ? (
          <label className="ml-1 flex items-center gap-1 text-xs text-text-muted">
            <span className="sr-only">Go to page</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={page}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) {
                  setPage(Math.min(totalPages, Math.max(1, Math.floor(n))));
                }
              }}
              className="h-7 w-12 rounded-control border border-hairline bg-surface-elevated px-1.5 text-center text-xs tabular-nums text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}
