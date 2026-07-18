import { useEffect, useState } from 'react';
import { ScanSearch } from 'lucide-react';
import { useDiagnosis } from '../hooks/use-diagnosis';
import { useIntelligence } from '../hooks/use-intelligence';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { Spinner } from '../components/common/Spinner';
import { StatusPill } from '../components/common/StatusPill';
import { FindingCard } from '../components/diagnosis/FindingCard';
import { DiagnosisContextViewer } from '../components/diagnosis/DiagnosisContextViewer';
import { DiagnosisHistory } from '../components/diagnosis/DiagnosisHistory';
import { PageShell } from '../components/layout/PageShell';

const EXAMPLE_QUERIES = [
  'Why is my computer slow?',
  'Why is disk space low?',
  'What crashed recently?',
  'What changed after the last update?',
];

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
  const { copilotStatus, loadCopilotStatus } = useIntelligence();
  const [query, setQuery] = useState('');

  useEffect(() => {
    void loadSessions();
    void loadCopilotStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAsk = (override?: string) => {
    const trimmed = (override ?? query).trim();
    if (trimmed.length > 0) {
      if (override) setQuery(override);
      void ask(trimmed);
    }
  };

  const statusLabel = copilotStatus
    ? copilotStatus.llmConfigured
      ? `${copilotStatus.provider} · ${copilotStatus.model}`
      : 'Heuristic · offline'
    : 'Checking…';

  return (
    <PageShell
      title="Copilot"
      description="Ask about this PC — answers come from local telemetry."
      actions={
        <StatusPill tone={copilotStatus?.llmConfigured ? 'info' : 'neutral'}>
          {statusLabel}
        </StatusPill>
      }
    >
      {error ? (
        <AlertBanner title="Something went wrong" message={error} />
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_240px]">
        <div className="min-w-0 space-y-3">
          <div className="panel p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAsk();
                }}
                placeholder="e.g. Why is my computer slow?"
                aria-label="Diagnosis question"
                className="field-lg flex-1"
              />
              <Button
                variant="primary"
                size="md"
                loading={running}
                onClick={() => handleAsk()}
                disabled={running || query.trim().length === 0}
              >
                {running ? 'Analyzing…' : 'Ask'}
              </Button>
            </div>
            <p className="mt-2 text-2xs text-text-muted">
              {copilotStatus?.llmConfigured
                ? `Using ${copilotStatus.provider} (${copilotStatus.model}).`
                : 'Offline heuristic — set XAI_API_KEY for richer answers.'}
            </p>
          </div>

          {running && current === null ? (
            <div className="flex justify-center py-16">
              <Spinner label="Analyzing…" />
            </div>
          ) : current === null ? (
            <EmptyState
              icon={<ScanSearch className="h-8 w-8" strokeWidth={1.75} />}
              heading="Ask Copilot"
              body="Describe a problem and get likely causes from this device’s telemetry."
              action={
                <div className="flex max-w-md flex-wrap justify-center gap-2">
                  {EXAMPLE_QUERIES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => handleAsk(example)}
                      className="rounded-control border border-hairline bg-surface-card px-3 py-1.5 text-xs text-text-secondary hover:border-hairline-strong hover:text-text-primary"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              }
            />
          ) : (
            <section className="panel">
              <div className="panel-header">
                <p className="panel-title">Answer</p>
                <p className="panel-subtitle">{current.query}</p>
              </div>
              <div className="panel-body space-y-4">
                <p className="text-sm leading-relaxed text-text-secondary">
                  {current.summary}
                </p>
                <div className="flex flex-col gap-3">
                  {findings.map((finding) => (
                    <FindingCard key={finding.id} finding={finding} />
                  ))}
                </div>
                <DiagnosisContextViewer context={current.context} />
              </div>
            </section>
          )}
        </div>

        <aside className="panel h-fit">
          <div className="panel-header">
            <p className="panel-title">History</p>
          </div>
          <div className="p-3">
            <DiagnosisHistory
              sessions={sessions}
              selectedId={current?.id ?? null}
              onSelect={(session) => void selectSession(session)}
            />
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
