import { useEffect } from 'react';
import { useDeviceDna } from '../hooks/use-device-dna';
import { AlertBanner } from '../components/common/AlertBanner';
import { PageHeader } from '../components/common/PageHeader';
import { Spinner } from '../components/common/Spinner';
import { TimelineEventList } from '../components/timeline/TimelineEventList';

export function Timeline() {
  const { timelineEvents, loadingTimeline, error, loadTimeline } =
    useDeviceDna();

  useEffect(() => {
    void loadTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page-shell page-section">
      <PageHeader
        title="Timeline"
        description="Software and config changes between consecutive baselines."
      />

      {error ? (
        <AlertBanner
          title="Could not load timeline"
          message={error}
          onRetry={() => void loadTimeline()}
        />
      ) : null}

      {loadingTimeline && timelineEvents.length === 0 ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading timeline…" />
        </div>
      ) : (
        <section className="panel">
          <div className="panel-header">
            <p className="panel-title">Change history</p>
            <p className="panel-subtitle">
              {timelineEvents.length} events from Device DNA diffs
            </p>
          </div>
          <div className="p-4">
            <TimelineEventList events={timelineEvents} />
          </div>
        </section>
      )}
    </div>
  );
}
