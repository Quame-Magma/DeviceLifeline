import { useEffect } from 'react';
import { useDeviceDna } from '../hooks/use-device-dna';
import { Spinner } from '../components/common/Spinner';
import { TimelineEventList } from '../components/timeline/TimelineEventList';

/**
 * Timeline page — shows a chronological list of device changes detected between
 * consecutive snapshots. All data access goes through `useDeviceDna`; no direct
 * `invoke` calls here.
 */
export function Timeline() {
  const { timelineEvents, loadingTimeline, error, loadTimeline } =
    useDeviceDna();

  // Load timeline events on mount.
  useEffect(() => {
    void loadTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <header className="flex items-center justify-between gap-4 border-b border-surface-border bg-surface-card px-6 py-4 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Timeline</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Changes detected between consecutive device snapshots.
          </p>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="mx-6 mt-4 flex items-start gap-3 rounded border border-status-error/30 bg-status-error-bg px-4 py-3 text-sm text-status-error flex-shrink-0"
        >
          <span aria-hidden="true" className="mt-0.5 text-base">
            ⚠
          </span>
          <div className="flex-1">
            <p className="font-medium">Something went wrong</p>
            <p className="text-status-error/80 mt-0.5">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadTimeline()}
            className="text-status-error underline hover:no-underline text-xs shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden pt-4">
        {loadingTimeline && timelineEvents.length === 0 ? (
          <div className="flex flex-1 items-center justify-center gap-3">
            <Spinner label="Loading timeline…" />
            <p className="text-sm text-text-secondary">Loading timeline…</p>
          </div>
        ) : (
          <TimelineEventList events={timelineEvents} />
        )}
      </div>
    </div>
  );
}
