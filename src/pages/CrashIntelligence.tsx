import { useEffect, useMemo, useState } from 'react';
import { useCrash } from '../hooks/use-crash';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import {
  CrashSummary,
  type CrashSeverityFilter,
} from '../components/crash/CrashSummary';
import { CrashEventList } from '../components/crash/CrashEventList';
import { PageShell } from '../components/layout/PageShell';

export function CrashIntelligence() {
  const { events, scanning, loading, error, loadCrashEvents, scanCrashEvents } =
    useCrash();
  const [filter, setFilter] = useState<CrashSeverityFilter>('all');

  useEffect(() => {
    void loadCrashEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((e) => e.severity === filter);
  }, [events, filter]);

  const filterLabel =
    filter === 'all'
      ? null
      : filter === 'critical'
        ? 'critical'
        : filter === 'error'
          ? 'error'
          : 'warning';

  return (
    <PageShell
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
    >
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
        <>
          <CrashSummary
            events={events}
            filter={filter}
            onFilterChange={setFilter}
          />
          <section className="panel">
            <div className="panel-header">
              <p className="panel-title">Events</p>
              <p className="panel-subtitle">
                {events.length === 0
                  ? 'Run a scan to read the Windows event log'
                  : filterLabel
                    ? `Showing ${filteredEvents.length} of ${events.length} · ${filterLabel}`
                    : `${events.length} recorded · click a chip above to filter`}
              </p>
            </div>
            <div className="panel-body">
              <CrashEventList events={filteredEvents} />
            </div>
          </section>
        </>
      )}
    </PageShell>
  );
}
