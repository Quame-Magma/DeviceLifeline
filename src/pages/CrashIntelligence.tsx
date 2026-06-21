import { useEffect } from 'react';
import { useCrash } from '../hooks/use-crash';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import { CrashSummary } from '../components/crash/CrashSummary';
import { CrashEventList } from '../components/crash/CrashEventList';

/**
 * Crash Intelligence page — Increment 6.
 *
 * Reads the device's stability history (BSODs, app crashes/hangs, unexpected
 * shutdowns) from the OS event log and presents each in plain English.
 * "Scan for crashes" reads the event log; re-scanning is idempotent.
 */
export function CrashIntelligence() {
  const { events, scanning, loading, error, loadCrashEvents, scanCrashEvents } =
    useCrash();

  // Load any previously recorded events on mount.
  useEffect(() => {
    void loadCrashEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScan = () => {
    void scanCrashEvents();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <header className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-surface-border bg-surface-card px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">
            Crash Intelligence
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Crashes, hangs, and unexpected shutdowns translated into likely
            causes and next steps.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          loading={scanning}
          onClick={handleScan}
          disabled={scanning}
        >
          {scanning ? 'Scanning…' : 'Scan for crashes'}
        </Button>
      </header>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="mx-6 mt-4 flex flex-shrink-0 items-start gap-3 rounded border border-status-error/30 bg-status-error-bg px-4 py-3 text-sm text-status-error"
        >
          <span aria-hidden="true" className="mt-0.5 text-base">
            ⚠
          </span>
          <div className="flex-1">
            <p className="font-medium">Something went wrong</p>
            <p className="mt-0.5 text-status-error/80">{error}</p>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5">
        {loading && events.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Spinner label="Loading crash history…" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <CrashSummary events={events} />
            <CrashEventList events={events} />
          </div>
        )}
      </div>
    </div>
  );
}
