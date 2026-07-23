import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Clock,
  Database,
  Download,
  ExternalLink,
  HardDrive,
  Lightbulb,
  Lock,
  Paperclip,
  Plus,
  RefreshCw,
  Rocket,
  Send,
  Sparkles,
  WifiOff,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useDiagnosis } from '../hooks/use-diagnosis';
import { useHealth } from '../hooks/use-health';
import { useIntelligence } from '../hooks/use-intelligence';
import { AlertBanner } from '../components/common/AlertBanner';
import { Button } from '../components/common/Button';
import { MiniSparkline } from '../components/common/MiniSparkline';
import { Spinner } from '../components/common/Spinner';
import { DiagnosisContextViewer } from '../components/diagnosis/DiagnosisContextViewer';
import type { View } from '../components/layout/Sidebar';
import { formatTimestamp } from '../lib/format';
import { toastInfo } from '../lib/feedback';
import type {
  DiagnosisFinding,
  DiagnosisSession,
} from '../types/device.types';

interface AIDetectiveProps {
  onNavigate?: (view: View) => void;
}

const QUICK_PROMPTS: {
  label: string;
  query: string;
  icon: LucideIcon;
}[] = [
  { label: 'Why is my PC slow?', query: 'Why is my PC slow?', icon: Clock },
  {
    label: 'Free up disk space',
    query: 'Why is disk space low and what can I safely remove?',
    icon: HardDrive,
  },
  {
    label: 'Analyze startup',
    query: 'What is slowing down startup on this PC?',
    icon: Rocket,
  },
  {
    label: 'Explain recent crashes',
    query: 'What crashed recently and why?',
    icon: AlertTriangle,
  },
];

/**
 * Copilot — redesigned to ChatGPT mock:
 * centered hero + ask bar, chat transcript with cause cards,
 * system context / history / tips sidebar, local-only footer.
 */
export function AIDetective({ onNavigate }: AIDetectiveProps) {
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
  const {
    copilotStatus,
    loadCopilotStatus,
    startLocalQwenInstall,
    installProgress,
    refreshInstallProgress,
    dashboard,
    loadDashboard,
  } = useIntelligence();
  const { samples, loadHealth } = useHealth();

  const [query, setQuery] = useState('');
  const [followUp, setFollowUp] = useState('');

  useEffect(() => {
    void loadSessions();
    void loadCopilotStatus();
    void loadDashboard();
    void loadHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const busy = installProgress?.busy === true;
    if (!busy) return;
    const id = window.setInterval(() => {
      void refreshInstallProgress();
      void loadCopilotStatus();
    }, 1200);
    return () => window.clearInterval(id);
  }, [installProgress?.busy, refreshInstallProgress, loadCopilotStatus]);

  const handleAsk = (override?: string) => {
    const trimmed = (override ?? query).trim();
    if (trimmed.length === 0) return;
    if (override) setQuery(override);
    void ask(trimmed);
  };

  const handleFollowUp = () => {
    const trimmed = followUp.trim();
    if (trimmed.length === 0) return;
    setQuery(trimmed);
    setFollowUp('');
    void ask(trimmed);
  };

  const localReady = copilotStatus?.local?.ready === true;
  const localInstalled =
    copilotStatus?.local?.modelInstalled === true &&
    copilotStatus?.local?.runtimeInstalled === true;
  const installBusy =
    installProgress?.busy === true ||
    copilotStatus?.local?.installBusy === true;
  const installPhase =
    installProgress?.phase ?? copilotStatus?.local?.installPhase ?? 'idle';
  const installPercent =
    installProgress?.percent ?? copilotStatus?.local?.installPercent ?? 0;
  const installMessage =
    installProgress?.message ?? copilotStatus?.local?.installMessage ?? '';
  const installError =
    installProgress?.error ?? copilotStatus?.local?.installError ?? null;
  const needsInstall = !localInstalled && !localReady;

  const healthScore =
    current?.context?.healthScore ??
    dashboard?.healthScore ??
    samples[0]?.healthScore ??
    null;

  const healthSparkline = useMemo(() => {
    const values = [...samples]
      .slice(0, 16)
      .reverse()
      .map((s) => s.healthScore);
    return values.length >= 2 ? values : [];
  }, [samples]);

  const lastScanLabel = useMemo(() => {
    const iso = sessions[0]?.createdAt ?? samples[0]?.capturedAt;
    if (!iso) return '—';
    return relativeTime(iso);
  }, [sessions, samples]);

  const modelLabel = localReady
    ? copilotStatus?.model || copilotStatus?.local?.model || 'Qwen3'
    : localInstalled
      ? copilotStatus?.local?.model || 'Qwen3'
      : 'Heuristic';

  const modeLabel = localReady
    ? 'Offline'
    : installBusy
      ? 'Installing'
      : localInstalled
        ? 'Starting'
        : 'Rules';

  /** Count only signals that are actually present in live telemetry. */
  const telemetrySignalCount = useMemo(() => {
    let n = 0;
    if (dashboard) n += 1;
    if (healthScore != null) n += 1;
    if (samples.length > 0) n += 1;
    if (copilotStatus) n += 1;
    const ctx = current?.context;
    if (!ctx) return n;
    if (ctx.cpuUsage != null) n += 1;
    if (ctx.memoryPct != null) n += 1;
    if (ctx.diskPct != null) n += 1;
    if (ctx.topProcessNames?.length) n += 1;
    if (ctx.recentCrashCategories?.length) n += 1;
    if (ctx.activeAlertKinds?.length) n += 1;
    if (ctx.softwareCount > 0) n += 1;
    if (ctx.recentChangeTitles?.length) n += 1;
    return n;
  }, [dashboard, healthScore, samples.length, copilotStatus, current?.context]);

  const answeredAt = current?.createdAt
    ? formatClock(current.createdAt)
    : null;

  const causeCards = useMemo(
    () => findings.slice(0, 3).map((f) => toCauseCard(f)),
    [findings],
  );

  const recommended = useMemo(() => {
    if (findings.length === 0) return null;
    const top = findings[0];
    return {
      text:
        top.suggestedAction ||
        'Review the top finding and open the related tool to fix it.',
      impact:
        findings.length > 1
          ? `Addressing these ${findings.length} findings can improve stability and responsiveness.`
          : 'Fixing this primary cause often improves overall system feel.',
    };
  }, [findings]);

  const recentSessions = sessions.slice(0, 5);

  return (
    <div className="page-shell page-section">
      {error ? (
        <AlertBanner title="Something went wrong" message={error} />
      ) : null}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
        {/* ── Main chat column ── */}
        <div className="min-w-0 space-y-3">
          {/* Install banner */}
          {needsInstall || installBusy || installPhase === 'error' ? (
            <section className="panel overflow-hidden border-accent/30">
              <div className="panel-body flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
                    <Sparkles className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary">
                      {installBusy
                        ? 'Installing on-device Copilot…'
                        : 'Enable on-device Copilot (local Qwen3)'}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-text-muted">
                      {installBusy
                        ? installMessage ||
                          'Downloading model and runtime. Keep the app open.'
                        : installError
                          ? installError
                          : 'Download a private local model (~640 MB) so answers stay on this PC. Heuristics still work until then.'}
                    </p>
                    {installBusy || installPercent > 0 ? (
                      <div className="mt-3 max-w-md">
                        <div className="mb-1 flex justify-between text-2xs text-text-muted">
                          <span>{installPhase.replace(/_/g, ' ')}</span>
                          <span className="tabular-nums">{installPercent}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className="h-full rounded-full bg-accent transition-[width] duration-300"
                            style={{ width: `${installPercent}%` }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                {!installBusy && installPhase !== 'ready' ? (
                  <Button
                    variant="primary"
                    size="sm"
                    loading={installBusy}
                    onClick={() => void startLocalQwenInstall()}
                    className="shrink-0"
                  >
                    <Download
                      className="h-3.5 w-3.5"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    Download local model
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* Hero + ask */}
          <section className="panel overflow-hidden">
            <div className="flex flex-col items-center px-panel-x pb-5 pt-8 text-center">
              <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-500/15 text-purple-300">
                <Sparkles className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <h1 className="text-xl font-semibold tracking-tight text-text-primary cause-semibold sm:text-2xl">
                DeviceLifeline Copilot
              </h1>
              <p className="mt-2 max-w-md text-sm text-text-muted">
                I&apos;ve already analyzed your computer.
                <br className="hidden sm:block" /> What would you like to know?
              </p>

              <div className="relative mt-6 w-full max-w-2xl">
                <div className="flex items-end gap-2 rounded-2xl border border-purple-500/40 bg-surface-elevated/40 px-3 py-2.5 shadow-[0_0_0_1px_rgba(168,85,247,0.08)] focus-within:border-purple-400/60">
                  <div className="min-w-0 flex-1">
                    <textarea
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAsk();
                        }
                      }}
                      rows={2}
                      placeholder="Ask anything about your PC…"
                      aria-label="Ask Copilot"
                      className="w-full resize-none bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                    />
                    <span className="mt-1 inline-flex items-center gap-1.5 text-2xs font-medium text-text-muted">
                      <Paperclip
                        className="h-3 w-3"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      Live telemetry attached automatically
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={running || query.trim().length === 0}
                    onClick={() => handleAsk()}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500 text-white transition-colors hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Send question"
                  >
                    {running ? (
                      <Spinner size="sm" label="Sending" />
                    ) : (
                      <Send className="h-4 w-4" strokeWidth={1.75} />
                    )}
                  </button>
                </div>
              </div>

              <div className="mt-4 flex max-w-2xl flex-wrap justify-center gap-2">
                {QUICK_PROMPTS.map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      disabled={running}
                      onClick={() => handleAsk(p.query)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-card px-3 py-1.5 text-2xs font-medium text-text-secondary transition-colors hover:border-hairline-strong hover:bg-surface-elevated hover:text-text-primary disabled:opacity-50"
                    >
                      <Icon className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Transcript / empty / loading */}
          {running && current === null ? (
            <div className="flex justify-center rounded-card border border-hairline bg-surface-card py-16 shadow-card">
              <Spinner label="Analyzing local telemetry…" />
            </div>
          ) : current ? (
            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-hairline px-panel-x py-2.5">
                <p className="text-2xs text-text-muted">
                  {answeredAt ? `Today · ${answeredAt}` : 'Conversation'}
                </p>
                {running ? (
                  <span className="text-2xs text-sky-400">Updating…</span>
                ) : null}
              </div>

              <div className="space-y-5 px-panel-x py-4">
                {/* User bubble */}
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-500 text-xs font-bold text-white">
                    A
                  </span>
                  <div className="min-w-0">
                    <p className="text-2xs text-text-muted">
                      <span className="font-semibold text-text-secondary">
                        You
                      </span>
                      {answeredAt ? (
                        <span className="ml-2">{answeredAt}</span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-sm font-medium text-text-primary">
                      {current.query}
                    </p>
                  </div>
                </div>

                {/* Copilot bubble */}
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-500/15 text-purple-300">
                    <Sparkles
                      className="h-3.5 w-3.5"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                  </span>
                  <div className="min-w-0 flex-1 space-y-4">
                    <div>
                      <p className="text-2xs text-text-muted">
                        <span className="font-semibold text-text-secondary">
                          Copilot
                        </span>
                        {answeredAt ? (
                          <span className="ml-2">{answeredAt}</span>
                        ) : null}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
                        {current.summary ||
                          (findings.length > 0
                            ? `I analyzed on-device telemetry and found ${findings.length} primary cause${findings.length === 1 ? '' : 's'} affecting this system.`
                            : 'I analyzed local telemetry for this question.')}
                      </p>
                    </div>

                    {/* Cause cards */}
                    {causeCards.length > 0 ? (
                      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                        {causeCards.map((card) => (
                          <CauseCard
                            key={card.id}
                            card={card}
                            onNavigate={onNavigate}
                          />
                        ))}
                      </div>
                    ) : null}

                    {/* Recommended next step */}
                    {recommended ? (
                      <div className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface-elevated/40 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
                            <Lightbulb
                              className="h-3.5 w-3.5"
                              strokeWidth={1.75}
                              aria-hidden
                            />
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-text-primary">
                              Recommended next step
                            </p>
                            <p className="mt-0.5 text-2xs leading-relaxed text-text-secondary">
                              {recommended.text}{' '}
                              <span className="text-text-muted">
                                {recommended.impact}
                              </span>
                            </p>
                          </div>
                        </div>
                        {(() => {
                          const dest = pickNavigateTarget(findings[0]);
                          const canGo = Boolean(dest && onNavigate);
                          return (
                            <Button
                              variant="primary"
                              size="sm"
                              className="shrink-0"
                              disabled={!canGo}
                              onClick={() => {
                                if (dest && onNavigate) onNavigate(dest);
                              }}
                            >
                              <Zap
                                className="h-3.5 w-3.5"
                                strokeWidth={1.75}
                                aria-hidden
                              />
                              {dest
                                ? optimizeLabel(dest)
                                : 'Review findings above'}
                            </Button>
                          );
                        })()}
                      </div>
                    ) : null}

                    {/* Collapsible raw context for power users */}
                    <details className="rounded-lg border border-hairline/80 bg-surface-elevated/20">
                      <summary className="cursor-pointer px-3 py-2 text-2xs font-medium text-text-muted hover:text-text-secondary">
                        Telemetry used for this answer
                      </summary>
                      <div className="border-t border-hairline px-3 py-2">
                        <DiagnosisContextViewer context={current.context} />
                      </div>
                    </details>
                  </div>
                </div>
              </div>

              {/* Follow-up composer */}
              <div className="border-t border-hairline px-panel-x py-3">
                <div className="flex items-center gap-2 rounded-xl border border-hairline bg-surface-elevated/30 px-3 py-2">
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-surface-elevated hover:text-text-primary"
                    aria-label="New question"
                    onClick={() => {
                      setQuery('');
                      setFollowUp('');
                    }}
                  >
                    <Plus className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <input
                    type="text"
                    value={followUp}
                    onChange={(e) => setFollowUp(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleFollowUp();
                    }}
                    placeholder="Ask a follow-up…"
                    aria-label="Follow-up question"
                    className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                    disabled={running}
                  />
                  <button
                    type="button"
                    disabled={running || followUp.trim().length === 0}
                    onClick={handleFollowUp}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-purple-300 hover:bg-purple-500/15 disabled:opacity-40"
                    aria-label="Send follow-up"
                  >
                    <Send className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className="rounded-card border border-dashed border-hairline bg-surface-card/40 px-panel-x py-10 text-center shadow-card">
              <p className="text-sm text-text-secondary">
                Pick a prompt above or type a question — answers use telemetry
                on this device only.
              </p>
              <p className="mt-1 text-2xs text-text-muted">
                {localReady
                  ? `Using local ${modelLabel}.`
                  : localInstalled
                    ? 'Local model installed — starts on first ask.'
                    : installBusy
                      ? 'Heuristics available while the model downloads.'
                      : 'Using on-device rules until the local model is installed.'}
              </p>
            </section>
          )}

          {/* Privacy footer */}
          <p className="flex items-center justify-center gap-1.5 px-2 py-1 text-center text-2xs text-text-muted">
            <Lock className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
            Copilot uses local telemetry only. No data leaves your device.
          </p>
        </div>

        {/* ── Right sidebar ── */}
        <aside className="flex min-w-0 flex-col gap-3">
          {/* System context */}
          <section className="panel overflow-hidden">
            <div className="panel-header flex items-center justify-between gap-2">
              <p className="panel-title">System context</p>
              <span className="inline-flex items-center gap-1.5 text-2xs font-medium text-status-success">
                <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
                Live
              </span>
            </div>
            <div className="space-y-4 px-panel-x py-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-2xs font-medium text-text-muted">
                    Health Score
                  </p>
                  <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">
                    <span
                      className={
                        healthScore == null
                          ? 'text-text-muted'
                          : healthScore < 40
                            ? 'text-status-error'
                            : healthScore < 70
                              ? 'text-status-warning'
                              : 'text-status-success'
                      }
                    >
                      {healthScore != null ? Math.round(healthScore) : '—'}
                    </span>
                    <span className="text-sm font-normal text-text-muted">
                      {' '}
                      / 100
                    </span>
                  </p>
                </div>
                {healthSparkline.length >= 2 ? (
                  <MiniSparkline
                    values={healthSparkline}
                    stroke={
                      healthScore != null && healthScore < 40
                        ? '#ff6b6b'
                        : healthScore != null && healthScore < 70
                          ? '#f5b942'
                          : '#3dd68c'
                    }
                    className="mt-1 h-8 w-24 opacity-90"
                    width={96}
                    height={32}
                  />
                ) : null}
              </div>

              <dl className="space-y-2.5 text-xs">
                <ContextRow
                  icon={Clock}
                  label="Last scan"
                  value={lastScanLabel}
                />
                <ContextRow
                  icon={Database}
                  label="Signals available"
                  value={
                    telemetrySignalCount > 0
                      ? String(telemetrySignalCount)
                      : '—'
                  }
                  valueClass="text-status-success"
                />
                <ContextRow
                  icon={Activity}
                  label="Data freshness"
                  value="Live"
                  valueClass="text-status-success"
                />
                <ContextRow
                  icon={Sparkles}
                  label="Model"
                  value={modelLabel}
                />
                <ContextRow
                  icon={WifiOff}
                  label="Mode"
                  value={modeLabel}
                  valueClass={
                    modeLabel === 'Offline'
                      ? 'text-status-success'
                      : 'text-text-secondary'
                  }
                />
              </dl>

              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => {
                  void loadDashboard();
                  void loadHealth();
                  void loadCopilotStatus();
                  toastInfo('Telemetry refreshed from this device.');
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                Refresh telemetry
              </Button>
            </div>
          </section>

          {/* Recent conversations */}
          <section className="panel overflow-hidden">
            <div className="panel-header">
              <p className="panel-title">Recent conversations</p>
            </div>
            <div className="px-2 py-2">
              {recentSessions.length === 0 ? (
                <p className="px-2 py-3 text-2xs text-text-muted">
                  No past questions yet.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {recentSessions.map((session) => (
                    <HistoryRow
                      key={session.id}
                      session={session}
                      active={session.id === current?.id}
                      onSelect={() => void selectSession(session)}
                    />
                  ))}
                </ul>
              )}
              {sessions.length > 5 ? (
                <p className="mt-1 px-2.5 py-2 text-2xs text-text-muted">
                  Showing 5 of {sessions.length} conversations on this device
                </p>
              ) : null}
            </div>
          </section>

          {/* Tips */}
          <section className="panel overflow-hidden">
            <div className="panel-header flex items-center gap-2">
              <Lightbulb
                className="h-3.5 w-3.5 text-status-warning"
                strokeWidth={1.75}
                aria-hidden
              />
              <p className="panel-title">Tips</p>
            </div>
            <div className="space-y-3 px-panel-x py-3.5">
              <p className="text-xs leading-relaxed text-text-secondary">
                Be specific for better answers. You can ask about performance,
                storage, crashes, security, and more.
              </p>
              {onNavigate ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300"
                  onClick={() => onNavigate('settings')}
                >
                  Copilot settings
                  <ExternalLink
                    className="h-3 w-3"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </button>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

/* ── helpers & subcomponents ── */

type Severity = 'Critical' | 'High' | 'Medium' | 'Low';

interface CauseCardModel {
  id: string;
  title: string;
  subtitle: string;
  body: string;
  metric: string;
  metricHint: string;
  severity: Severity;
  icon: LucideIcon;
  iconClass: string;
  metricClass: string;
  actionLabel: string;
  navigateTo: View | null;
}

function toCauseCard(finding: DiagnosisFinding): CauseCardModel {
  const hay = (
    finding.title +
    ' ' +
    finding.cause +
    ' ' +
    finding.evidence +
    ' ' +
    finding.suggestedAction
  ).toLowerCase();

  let severity: Severity =
    finding.confidence >= 80
      ? 'Critical'
      : finding.confidence >= 60
        ? 'High'
        : finding.confidence >= 40
          ? 'Medium'
          : 'Low';

  let icon: LucideIcon = Activity;
  let iconClass = 'bg-sky-500/15 text-sky-400';
  let metricClass = 'text-sky-400';
  let actionLabel = 'Inspect';
  let navigateTo: View | null = null;
  let metric = `${Math.round(finding.confidence)}%`;
  let metricHint = 'Confidence';

  if (
    hay.includes('disk') ||
    hay.includes('storage') ||
    hay.includes('space') ||
    hay.includes('temp')
  ) {
    icon = HardDrive;
    iconClass = 'bg-status-error/15 text-status-error';
    metricClass = 'text-status-error';
    actionLabel = 'Open Storage';
    navigateTo = 'storage';
    severity =
      finding.confidence >= 70
        ? 'Critical'
        : finding.confidence >= 50
          ? 'High'
          : 'Medium';
  } else if (
    hay.includes('memory') ||
    hay.includes('ram') ||
    hay.includes('process') ||
    hay.includes('cpu')
  ) {
    icon = Activity;
    iconClass = 'bg-status-warning/15 text-status-warning';
    metricClass = 'text-status-warning';
    actionLabel = 'Inspect Process';
    navigateTo = 'processes';
  } else if (hay.includes('startup') || hay.includes('boot')) {
    icon = Rocket;
    iconClass = 'bg-status-success/15 text-status-success';
    metricClass = 'text-status-success';
    actionLabel = 'Manage Startup';
    navigateTo = 'startup';
  } else if (
    hay.includes('crash') ||
    hay.includes('bsod') ||
    hay.includes('kernel')
  ) {
    icon = AlertTriangle;
    iconClass = 'bg-status-error/15 text-status-error';
    metricClass = 'text-status-error';
    actionLabel = 'Open Crashes';
    navigateTo = 'crash-intelligence';
  } else if (hay.includes('clean') || hay.includes('cache')) {
    icon = HardDrive;
    iconClass = 'bg-sky-500/15 text-sky-400';
    metricClass = 'text-sky-400';
    actionLabel = 'Open Cleanup';
    navigateTo = 'cleanup';
  } else if (hay.includes('driver')) {
    icon = Zap;
    iconClass = 'bg-purple-500/20 text-purple-300';
    metricClass = 'text-purple-300';
    actionLabel = 'Open Drivers';
    navigateTo = 'drivers';
  }

  // Pull a short metric-ish token from evidence when possible
  const pctMatch = finding.evidence.match(/(\d+(?:\.\d+)?)\s*%/);
  const gbMatch = finding.evidence.match(/(\d+(?:\.\d+)?)\s*GB/i);
  if (pctMatch) {
    metric = `${pctMatch[1]}%`;
    metricHint = finding.evidence.slice(0, 48);
  } else if (gbMatch) {
    metric = `${gbMatch[1]} GB`;
    metricHint = finding.evidence.slice(0, 48);
  }

  return {
    id: finding.id,
    title: finding.title,
    subtitle: finding.cause.slice(0, 48) + (finding.cause.length > 48 ? '…' : ''),
    body: finding.cause,
    metric,
    metricHint: metricHint.length > 40 ? metricHint.slice(0, 40) + '…' : metricHint,
    severity,
    icon,
    iconClass,
    metricClass,
    actionLabel,
    navigateTo,
  };
}

function pickNavigateTarget(finding?: DiagnosisFinding): View | null {
  if (!finding) return null;
  return toCauseCard(finding).navigateTo;
}

function optimizeLabel(view: View): string {
  switch (view) {
    case 'storage':
      return 'Open Storage';
    case 'cleanup':
      return 'Open Cleanup';
    case 'processes':
      return 'Open Processes';
    case 'startup':
      return 'Open Startup';
    case 'crash-intelligence':
      return 'Open Crashes';
    case 'drivers':
      return 'Open Drivers';
    case 'health':
      return 'Open Health';
    default:
      return 'Open related tool';
  }
}

function CauseCard({
  card,
  onNavigate,
}: {
  card: CauseCardModel;
  onNavigate?: (view: View) => void;
}) {
  const Icon = card.icon;
  const badgeClass =
    card.severity === 'Critical'
      ? 'bg-status-error/15 text-status-error'
      : card.severity === 'High'
        ? 'bg-status-warning/15 text-status-warning'
        : card.severity === 'Medium'
          ? 'bg-sky-500/15 text-sky-400'
          : 'bg-surface-elevated text-text-muted';

  return (
    <article className="flex flex-col rounded-xl border border-hairline bg-surface-elevated/30 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={[
              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
              card.iconClass,
            ].join(' ')}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-text-primary">
              {card.title}
            </p>
            <p className="mt-0.5 truncate text-2xs text-text-muted">
              {card.subtitle}
            </p>
          </div>
        </div>
        <span
          className={[
            'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            badgeClass,
          ].join(' ')}
        >
          {card.severity}
        </span>
      </div>
      <p className="mt-2.5 line-clamp-2 text-2xs leading-relaxed text-text-secondary">
        {card.body}
      </p>
      <p
        className={[
          'mt-3 text-xl font-semibold tabular-nums tracking-tight cause-semibold',
          card.metricClass,
        ].join(' ')}
      >
        {card.metric}
      </p>
      <p className="text-2xs text-text-muted">{card.metricHint}</p>
      <button
        type="button"
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-control border border-hairline bg-surface-card px-2.5 py-1.5 text-2xs font-medium text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
        onClick={() => {
          if (card.navigateTo && onNavigate) onNavigate(card.navigateTo);
          else toastInfo(card.actionLabel);
        }}
      >
        {card.actionLabel}
      </button>
    </article>
  );
}

function ContextRow({
  icon: Icon,
  label,
  value,
  valueClass,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="flex items-center gap-2 text-text-muted">
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
        {label}
      </dt>
      <dd
        className={[
          'truncate text-right font-medium tabular-nums',
          valueClass ?? 'text-text-primary',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}

function HistoryRow({
  session,
  active,
  onSelect,
}: {
  session: DiagnosisSession;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={[
          'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
          active
            ? 'bg-purple-500/15 text-text-primary'
            : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
        ].join(' ')}
      >
        <span className="min-w-0 truncate text-xs font-medium">
          {session.query}
        </span>
        <span className="shrink-0 text-2xs text-text-muted">
          {relativeTime(session.createdAt)}
        </span>
      </button>
    </li>
  );
}

function formatClock(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return formatTimestamp(iso);
  }
}

function relativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return formatTimestamp(iso);
    const diffMs = Date.now() - then;
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return formatTimestamp(iso);
  } catch {
    return formatTimestamp(iso);
  }
}

