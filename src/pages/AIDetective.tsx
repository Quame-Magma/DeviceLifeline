import { useEffect, useState } from 'react';
import { useDiagnosis } from '../hooks/use-diagnosis';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import { EmptyState } from '../components/common/EmptyState';
import { FindingCard } from '../components/diagnosis/FindingCard';
import { DiagnosisContextViewer } from '../components/diagnosis/DiagnosisContextViewer';
import { DiagnosisHistory } from '../components/diagnosis/DiagnosisHistory';

/**
 * AI Detective page — Increment 11 (offline / heuristic).
 *
 * The user asks a natural-language question; analysis runs fully on-device over
 * a privacy-safe context summary. The real LLM-backed provider is a later
 * config-gated drop-in.
 */
export function AIDetective() {
  const {
    sessions,
    current,
    findings,
    running,
    error,
    loadSessions,
    ask,
    selectSession,
  } = useDiagnosis();

  const [query, setQuery] = useState('');

  // Load the session history on mount.
  useEffect(() => {
    void loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAsk = () => {
    const trimmed = query.trim();
    if (trimmed.length > 0) {
      void ask(trimmed);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <header className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-surface-border bg-surface-card px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">
            AI Detective
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Ask a question about your device; analysis runs entirely on-device.
          </p>
        </div>
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

      <div className="flex flex-1 overflow-hidden">
        {/* Main column */}
        <section className="flex flex-1 flex-col overflow-hidden">
          {/* Query bar */}
          <div className="flex flex-shrink-0 items-center gap-3 border-b border-surface-border bg-surface px-6 py-3">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleAsk();
                }
              }}
              placeholder="e.g. Why is my PC slow lately?"
              aria-label="Diagnosis question"
              className="flex-1 rounded border border-surface-border bg-white px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <Button
              variant="primary"
              size="sm"
              loading={running}
              onClick={handleAsk}
              disabled={running || query.trim().length === 0}
            >
              {running ? 'Analyzing…' : 'Ask'}
            </Button>
          </div>
          <p className="flex-shrink-0 px-6 py-2 text-2xs text-text-muted">
            Offline heuristic analysis — connect an AI key later for richer,
            natural-language answers.
          </p>

          {/* Result */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4">
            {running && current === null ? (
              <div className="flex items-center justify-center py-16">
                <Spinner label="Analyzing…" />
              </div>
            ) : current === null ? (
              <EmptyState
                heading="Ask the AI Detective"
                body="Describe a problem (slow, crashing, low space) and get likely causes from your device's own telemetry."
              />
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-text-secondary">{current.summary}</p>
                <div className="flex flex-col gap-3">
                  {findings.map((finding) => (
                    <FindingCard key={finding.id} finding={finding} />
                  ))}
                </div>
                <DiagnosisContextViewer context={current.context} />
              </div>
            )}
          </div>
        </section>

        {/* History */}
        <aside className="w-[240px] flex-shrink-0 overflow-y-auto border-l border-surface-border bg-surface-card p-3 scrollbar-thin">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            History
          </p>
          <DiagnosisHistory
            sessions={sessions}
            selectedId={current?.id ?? null}
            onSelect={(session) => void selectSession(session)}
          />
        </aside>
      </div>
    </div>
  );
}
