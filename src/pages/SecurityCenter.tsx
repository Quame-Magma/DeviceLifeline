import { useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useSecurity } from '../hooks/use-security';
import { usePaginatedItems } from '../hooks/use-pagination';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Pagination } from '../components/common/Pagination';
import { Spinner } from '../components/common/Spinner';
import { StatRow, StatTile } from '../components/common/StatTile';
import { StatusPill } from '../components/common/StatusPill';
import { formatTimestamp } from '../lib/format';
import type { SecurityFinding } from '../types/device.types';
import { PageShell } from '../components/layout/PageShell';

function severityTone(
  severity: string,
): 'neutral' | 'success' | 'warning' | 'error' | 'info' {
  const s = severity.toLowerCase();
  if (s === 'critical' || s === 'error') return 'error';
  if (s === 'warning') return 'warning';
  if (s === 'info') return 'info';
  return 'neutral';
}

export function SecurityCenter() {
  const {
    findings,
    loading,
    scanning,
    dismissing,
    error,
    loadFindings,
    scan,
    dismiss,
  } = useSecurity();

  useEffect(() => {
    void loadFindings(false);
  }, [loadFindings]);

  const criticalCount = findings.filter(
    (f) => f.severity.toLowerCase() === 'critical',
  ).length;
  const warningCount = findings.filter(
    (f) => f.severity.toLowerCase() === 'warning',
  ).length;
  const { pageItems, pagination } = usePaginatedItems(findings);

  return (
    <PageShell
      title="Security"
      description="Persistence, privilege, and suspicious activity findings."
      actions={
        <Button
          variant="primary"
          size="sm"
          loading={scanning}
          onClick={() => void scan()}
        >
          {scanning ? 'Scanning…' : 'Scan security'}
        </Button>
      }
    >
      {error ? (
        <AlertBanner title="Security scan unavailable" message={error} />
      ) : null}

      <StatRow columns={3}>
        <StatTile label="Open" value={findings.length} />
        <StatTile label="Critical" value={criticalCount} />
        <StatTile label="Warning" value={warningCount} />
      </StatRow>

      {loading && findings.length === 0 ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading findings…" />
        </div>
      ) : findings.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-8 w-8" strokeWidth={1.75} />}
          heading="No security findings"
          body="Run a scan to check persistence risks and suspicious processes."
          action={
            <Button
              variant="primary"
              size="sm"
              loading={scanning}
              onClick={() => void scan()}
            >
              Scan security
            </Button>
          }
        />
      ) : (
        <section className="panel">
          <div className="panel-header">
            <p className="panel-title">Findings</p>
            <p className="panel-subtitle">
              Newest first · dismiss when resolved
            </p>
          </div>
          <ul className="divide-y divide-hairline">
            {pageItems.map((finding) => (
              <FindingRow
                key={finding.id}
                finding={finding}
                dismissing={dismissing}
                onDismiss={() => void dismiss(finding.id)}
              />
            ))}
          </ul>
          <Pagination pagination={pagination} itemLabel="findings" />
        </section>
      )}
    </PageShell>
  );
}

function FindingRow({
  finding,
  dismissing,
  onDismiss,
}: {
  finding: SecurityFinding;
  dismissing: boolean;
  onDismiss: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 px-panel-x py-3.5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={severityTone(finding.severity)}>
            {finding.severity}
          </StatusPill>
          <span className="text-2xs text-text-muted">
            {formatTimestamp(finding.createdAt)}
          </span>
        </div>
        <p className="mt-1.5 text-sm font-medium text-text-primary">
          {finding.title}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-text-secondary">
          {finding.summary}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        disabled={dismissing}
        onClick={onDismiss}
      >
        Dismiss
      </Button>
    </li>
  );
}
