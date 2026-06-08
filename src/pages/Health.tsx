import { useEffect } from 'react';
import { useHealth } from '../hooks/use-health';
import { formatTimestamp } from '../lib/format';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { Spinner } from '../components/common/Spinner';
import { HealthScoreGauge } from '../components/health/HealthScoreGauge';
import { ResourceUsageBars } from '../components/health/ResourceUsageBars';
import { HealthSampleList } from '../components/health/HealthSampleList';
import { HealthAlertList } from '../components/health/HealthAlertList';

/**
 * Health Intelligence page — Increment 5.
 *
 * Shows the current device HealthScore, live CPU/memory/disk usage, and a
 * history of recent samples. "Sample now" captures a fresh on-device reading.
 */
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

  // Load the latest sample and history on mount.
  useEffect(() => {
    void loadHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSample = () => {
    void collectSample();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <header className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-surface-border bg-surface-card px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">
            Health Intelligence
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            On-device CPU, memory, and disk health with a 0-100 score.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          loading={sampling}
          onClick={handleSample}
          disabled={sampling}
        >
          {sampling ? 'Sampling…' : 'Sample now'}
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
        {alerts.length > 0 && (
          <section className="mb-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Alerts
            </p>
            <HealthAlertList
              alerts={alerts}
              onAcknowledge={(id) => void acknowledge(id)}
            />
          </section>
        )}
        {loading && latest === null ? (
          <div className="flex items-center justify-center py-16">
            <Spinner label="Loading health…" />
          </div>
        ) : latest === null ? (
          <EmptyState
            heading="No health data yet"
            body="Take your first sample to measure this device's CPU, memory, and disk health."
            action={
              <Button
                variant="primary"
                size="sm"
                loading={sampling}
                onClick={handleSample}
              >
                Sample now
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-[auto_1fr]">
              <HealthScoreGauge score={latest.healthScore} />
              <Card padding="lg" className="flex flex-col justify-center">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Current usage
                </p>
                <ResourceUsageBars sample={latest} />
                <p className="mt-4 text-2xs text-text-muted">
                  Sampled {formatTimestamp(latest.capturedAt)}
                </p>
              </Card>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Recent samples
              </p>
              <Card padding="md">
                <HealthSampleList samples={samples} />
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
