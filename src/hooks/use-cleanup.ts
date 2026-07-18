import { useCallback, useState } from 'react';
import {
  executeCleanup as apiExecute,
  scanCleanupPreview,
} from '../api/tauri/cleanup';
import type { CleanupPreview, CleanupResult } from '../types/device.types';

function toMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

export function useCleanup() {
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [result, setResult] = useState<CleanupResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async (opts?: { keepResult?: boolean }) => {
    setLoading(true);
    setError(null);
    if (!opts?.keepResult) {
      setResult(null);
    }
    try {
      const p = await scanCleanupPreview();
      setPreview(p);
      // Keep current selection if still valid; else default to safe.
      setSelected((prev) => {
        const ids = new Set(p.categories.map((c) => c.id));
        const kept = [...prev].filter((id) => ids.has(id));
        if (kept.length > 0) return new Set(kept);
        return new Set(
          p.categories.filter((c) => c.risk === 'safe').map((c) => c.id),
        );
      });
    } catch (err) {
      setError(toMessage(err, 'Cleanup scan failed.'));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleCategory = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (!preview) return;
    setSelected(new Set(preview.categories.map((c) => c.id)));
  }, [preview]);

  const selectSafeOnly = useCallback(() => {
    if (!preview) return;
    setSelected(
      new Set(
        preview.categories.filter((c) => c.risk === 'safe').map((c) => c.id),
      ),
    );
  }, [preview]);

  const execute = useCallback(async () => {
    setActing(true);
    setError(null);
    try {
      const cats = Array.from(selected);
      if (cats.length === 0) {
        setError('Select at least one category to clean.');
        return;
      }
      const r = await apiExecute(cats, true);
      setResult(r);
      if (r.deletedCount === 0 && r.failedCount > 0) {
        const sample = (r.errors ?? []).slice(0, 3).join(' · ');
        setError(
          sample
            ? `Nothing deleted. ${sample}`
            : 'Nothing deleted — files may be locked (close browsers/apps) or need elevation.',
        );
      } else if (r.deletedCount === 0) {
        setError(
          'Nothing to delete in the selected categories (already clean, or only virtual actions failed).',
        );
      }
      // Refresh counts but keep the result banner visible.
      await scan({ keepResult: true });
    } catch (err) {
      setError(toMessage(err, 'Cleanup execute failed.'));
    } finally {
      setActing(false);
    }
  }, [selected, scan]);

  return {
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
  };
}
