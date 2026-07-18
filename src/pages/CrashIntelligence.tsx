import { useEffect } from 'react';
import { useCrash } from '../hooks/use-crash';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { PageHeader } from '../components/common/PageHeader';
import { Spinner } from '../components/common/Spinner';
import { CrashSummary } from '../components/crash/CrashSummary';
import { CrashEventList } from '../components/crash/CrashEventList';

export function CrashIntelligence() {
  const { events, scanning, loading, error, loadCrashEvents, scanCrashEvents } =
    useCrash();

  useEffect(() => {
    void loadCrashEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page-shell page-section">
      <PageHeader
        title="Crashes"
        description="BSODs, app hangs, and unexpected shutdowns with plain-English causes."
        actions={
          <Button
            variant="primary"
            size="sm"
            loading={scanning}
            onClick={() => void scanCrashEvents()}
          >
            {scanning ? 'Scanning…' : 'Scan event log'}
          </Button>
        }
      />

      {error ? (
        <AlertBanner
          title="Could not load crashes"
          message={error}
          onRetry={() => void loadCrashEvents()}
        />
      ) : null}

      {loading && events.length === 0 ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading crash history…" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <CrashSummary events={events} />
          <section className="panel">
            <div className="panel-header">
              <p className="panel-title">Events</p>
              <p className="panel-subtitle">
                {events.length === 0
                  ? 'Run a scan to read the Windows event log'
                  : `${events.length} recorded`}
              </p>
            </div>
            <div className="p-4">
              <CrashEventList events={events} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
