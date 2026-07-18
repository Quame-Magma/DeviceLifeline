import { useEffect } from 'react';
import { useHealth } from '../hooks/use-health';
import { formatPercent, formatTimestamp } from '../lib/format';
import { usePaginatedItems } from '../hooks/use-pagination';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Pagination } from '../components/common/Pagination';
import { Spinner } from '../components/common/Spinner';
import { StatRow, StatTile } from '../components/common/StatTile';
import { HealthScoreGauge } from '../components/health/HealthScoreGauge';
import { ResourceUsageBars } from '../components/health/ResourceUsageBars';
import { HealthSampleList } from '../components/health/HealthSampleList';
import { HealthAlertList } from '../components/health/HealthAlertList';
import { buildHealthInsight } from '../components/health/insights';
import { PageShell } from '../components/layout/PageShell';

export function Health() {
  const {
    latest,
    samples,
    alerts,
    sampling,
    loading,
    error,
    loadHealth,
    collectSample,
    acknowledge,
  } = useHealth();

  const { pageItems: pageSamples, pagination: samplePages } =
    usePaginatedItems(samples);
  const { pageItems: pageAlerts, pagination: alertPages } =
    usePaginatedItems(alerts);

  useEffect(() => {
    void loadHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageShell
      title="Health"
      description="CPU, memory, and disk pressure on this PC."
      actions={
        <Button
          variant="primary"
          size="sm"
          loading={sampling}
          onClick={() => void collectSample()}
        >
          {sampling ? 'Sampling…' : 'Sample now'}
        </Button>
      }
    >
      {error ? (
        <AlertBanner
          title="Could not load health"
          message={error}
          onRetry={() => void loadHealth()}
        />
      ) : null}

      {loading && latest === null ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading health…" />
        </div>
      ) : latest === null ? (
        <EmptyState
          heading="No health data yet"
          body="Take a sample to measure CPU, memory, and disk pressure."
          action={
            <Button
              variant="primary"
              size="sm"
              loading={sampling}
              onClick={() => void collectSample()}
            >
              Sample now
            </Button>
          }
        />
      ) : (
        <>
          {(() => {
            const insight = buildHealthInsight(latest, alerts);
            return (
              <>
                {/* Hero — same density as Overview PC Health */}
                <section className="panel overflow-hidden">
                  <div className="grid gap-5 p-5 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:gap-8 lg:p-6">
                    <div className="flex justify-center lg:justify-start">
                      <HealthScoreGauge score={latest.healthScore} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                        Status · {formatTimestamp(latest.capturedAt)}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-text-primary cause-semibold">
                        {insight.summary}
                      </p>
                      <p className="mt-1 text-sm text-text-muted">
                        {insight.primaryConcern}
                      </p>
                      <div className="mt-4">
                        <ResourceUsageBars sample={latest} />
                      </div>
                      <p className="mt-4 rounded-control border border-hairline bg-surface-elevated px-3 py-2 text-xs text-text-secondary">
                        <span className="font-medium text-text-primary">
                          Next:{' '}
                        </span>
                        {insight.recommendedAction}
                      </p>
                    </div>
                  </div>
                </section>

                <StatRow columns={3}>
                  <StatTile label="Status" value={insight.status} />
                  <StatTile
                    label="CPU"
                    value={formatPercent(latest.cpuUsage)}
                  />
                  <StatTile
                    label="Memory"
                    value={formatPercent(
                      latest.memoryTotal > 0
                        ? (latest.memoryUsed / latest.memoryTotal) * 100
                        : 0,
                    )}
                  />
                </StatRow>

                <section className="panel">
                  <div className="panel-header">
                    <p className="panel-title">Recent samples</p>
                    <p className="panel-subtitle">
                      {samples.length} on this device
                    </p>
                  </div>
                  <div className="panel-body">
                    <HealthSampleList samples={pageSamples} />
                  </div>
                  <Pagination pagination={samplePages} itemLabel="samples" />
                </section>
              </>
            );
          })()}
        </>
      )}

      {/* Alerts below status so they never bury the health readout */}
      {alerts.length > 0 ? (
        <section className="panel">
          <div className="panel-header">
            <p className="panel-title">Open alerts</p>
            <p className="panel-subtitle">{alerts.length} need attention</p>
          </div>
          <div className="panel-body">
            <HealthAlertList
              alerts={pageAlerts}
              onAcknowledge={(id) => void acknowledge(id)}
            />
          </div>
          <Pagination pagination={alertPages} itemLabel="alerts" />
        </section>
      ) : null}
    </PageShell>
  );
}
