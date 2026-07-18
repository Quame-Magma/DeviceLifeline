import { useEffect, useMemo } from 'react';
import { Cpu } from 'lucide-react';
import { useSysReport } from '../hooks/use-sysreport';
import { usePaginatedItems } from '../hooks/use-pagination';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Pagination } from '../components/common/Pagination';
import { Spinner } from '../components/common/Spinner';
import { StatRow, StatTile } from '../components/common/StatTile';
import { formatTimestamp } from '../lib/format';
import { PageShell } from '../components/layout/PageShell';

/**
 * AIDA64-class system inventory report + light synthetic benchmarks.
 */
export function SystemReport() {
  const { report, benches, loading, benching, error, loadReport, runBench } =
    useSysReport();

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const rows = report?.rows ?? [];
  const { pageItems, pagination } = usePaginatedItems(rows);

  const sections = useMemo(() => {
    const s = new Set(rows.map((r) => r.section));
    return s.size;
  }, [rows]);

  const exportJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `devicelifeline-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageShell
      title="System report"
      description="OS, hardware inventory, and light synthetic benchmarks."
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={!report}
            onClick={exportJson}
          >
            Export JSON
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={benching}
            onClick={() => void runBench('all')}
          >
            {benching ? 'Benching…' : 'Run benches'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={loading}
            onClick={() => void loadReport()}
          >
            Refresh report
          </Button>
        </>
      }
    >
      {error ? (
        <AlertBanner title="Report unavailable" message={error} />
      ) : null}

      <StatRow columns={3}>
        <StatTile label="Inventory rows" value={rows.length} />
        <StatTile label="Sections" value={sections} />
        <StatTile label="Installed apps" value={report?.softwareCount ?? 0} />
      </StatRow>

      {report ? (
        <p className="text-sm text-text-secondary">
          {report.summary}
          <span className="ml-2 text-2xs text-text-muted">
            · {formatTimestamp(report.capturedAt)}
          </span>
        </p>
      ) : null}

      {benches.length > 0 ? (
        <section className="panel">
          <div className="panel-header">
            <p className="panel-title">Benchmarks</p>
            <p className="panel-subtitle">
              Synthetic scores for comparison on this machine only — not SPECint
              / CrystalDiskMark certified
            </p>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            {benches.map((b) => (
              <div
                key={b.kind}
                className="rounded-control border border-hairline bg-surface-elevated p-3"
              >
                <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
                  {b.label}
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
                  {b.score.toFixed(1)}{' '}
                  <span className="text-xs font-normal text-text-secondary">
                    {b.unit}
                  </span>
                </p>
                <p className="mt-1 text-2xs text-text-muted">{b.detail}</p>
                <p className="mt-0.5 text-2xs text-text-muted">
                  {b.durationMs} ms
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-header">
          <p className="panel-title">Inventory</p>
          <p className="panel-subtitle">Full OS-available system facts</p>
        </div>
        {loading && !report ? (
          <div className="flex justify-center py-16">
            <Spinner label="Building system report…" />
          </div>
        ) : !report ? (
          <EmptyState
            icon={<Cpu className="h-8 w-8" strokeWidth={1.75} />}
            heading="No report yet"
            body="Refresh to collect OS, hardware, and software inventory."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Key</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((r, i) => (
                    <tr key={`${r.section}-${r.key}-${i}`}>
                      <td className="text-xs text-text-muted">{r.section}</td>
                      <td className="font-medium text-text-primary">{r.key}</td>
                      <td className="font-mono text-xs">{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={pagination} itemLabel="rows" />
          </>
        )}
      </section>
    </PageShell>
  );
}
