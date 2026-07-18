import { useMemo, useState, useEffect } from 'react';

/** Single global page size — consistent across the entire app. */
export const DEFAULT_PAGE_SIZE = 10;

export interface PaginationState {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  canNext: boolean;
  canPrev: boolean;
}

/**
 * Client-side pagination. Always uses {@link DEFAULT_PAGE_SIZE} (10).
 */
export function usePagination(totalItems: number): PaginationState {
  const pageSize = DEFAULT_PAGE_SIZE;
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize) || 1);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  // Reset to page 1 when the list shrinks/grows materially (filter changes).
  useEffect(() => {
    setPage(1);
  }, [totalItems]);

  const startIndex = totalItems === 0 ? 0 : (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    startIndex,
    endIndex,
    setPage,
    nextPage: () => setPage((p) => Math.min(totalPages, p + 1)),
    prevPage: () => setPage((p) => Math.max(1, p - 1)),
    canNext: page < totalPages,
    canPrev: page > 1,
  };
}

export function paginateSlice<T>(
  items: readonly T[],
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function usePaginatedItems<T>(items: readonly T[]): {
  pageItems: T[];
  pagination: PaginationState;
} {
  const pagination = usePagination(items.length);
  const pageItems = useMemo(
    () => paginateSlice(items, pagination.page, pagination.pageSize),
    [items, pagination.page, pagination.pageSize],
  );
  return { pageItems, pagination };
}
