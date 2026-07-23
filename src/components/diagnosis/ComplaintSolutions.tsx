import { Check } from 'lucide-react';
import { Button } from '../common/Button';
import type { DiagnosisContext, DiagnosisFinding } from '../../types/device.types';

type PlanTone = 'blue' | 'amber' | 'red' | 'green';

export interface ComplaintSolution {
  title: string;
  why: string;
  steps: string[];
  verify: string;
  askQuery: string;
  tone: PlanTone;
}

interface ComplaintSolutionsProps {
  context: DiagnosisContext;
  findings: DiagnosisFinding[];
  onAsk: (query: string) => void;
}

function matchesFinding(findings: DiagnosisFinding[], terms: string[]) {
  return findings.some((finding) => {
    const haystack = (finding.title + ' ' + finding.cause + ' ' + finding.suggestedAction).toLowerCase();
    return terms.some((term) => haystack.includes(term));
  });
}

export function getComplaintSolutions(
  context: DiagnosisContext,
  findings: DiagnosisFinding[],
): ComplaintSolution[] {
  const intent = (context.queryIntent || 'general').toLowerCase();
  const alerts = (context.activeAlertKinds || []).join(' ').toLowerCase();
  const crashes = (context.recentCrashCategories || []).join(' ').toLowerCase();
  const memorySignal =
    (context.memoryPct || 0) >= 85 ||
    alerts.includes('memory') ||
    matchesFinding(findings, ['memory pressure', 'high memory']);
  const cpuSignal =
    (context.cpuUsage || 0) >= 90 ||
    alerts.includes('cpu') ||
    matchesFinding(findings, ['high cpu', 'cpu pressure']);
  const diskSignal =
    (context.diskPct || 0) >= 85 ||
    alerts.includes('disk') ||
    alerts.includes('storage') ||
    matchesFinding(findings, ['low disk', 'disk space', 'storage']);
  const crashSignal =
    crashes.length > 0 ||
    intent === 'crash' ||
    matchesFinding(findings, ['crash', 'bsod', 'kernel', 'blue screen']);
  const plans: ComplaintSolution[] = [];
  const add = (plan: ComplaintSolution) => {
    if (!plans.some((existing) => existing.title === plan.title)) plans.push(plan);
  };

  if (intent === 'slow' || intent === 'memory' || memorySignal) {
    add({
      title: 'Reduce memory pressure',
      why: 'High memory use can force Windows to page data to disk. First confirm whether one app is growing or the whole workload is too large.',
      steps: [
        'Open Processes and sort by Memory; refresh twice to confirm the same app stays near the top.',
        'Save your work, then close or update only the app you recognize as the source.',
        'If this repeats during normal work, compare the workload with the installed RAM before recommending an upgrade.',
      ],
      verify: 'Run Health again and confirm memory falls below 85% while the slowdown improves.',
      askQuery: 'Which process is causing my memory pressure?',
      tone: 'amber',
    });
  }

  if (intent === 'slow' || intent === 'cpu' || cpuSignal) {
    add({
      title: 'Find the CPU hog',
      why: 'A sustained CPU spike is usually caused by one process, a scheduled task, or a driver. Identify the repeat offender before changing system settings.',
      steps: [
        'Open Processes and refresh twice; note the process that remains high rather than a one-second spike.',
        'If it is a recognized app, save work and close it or install its latest update.',
        'If it is a Windows or security process, capture the process details and investigate the related service or driver first.',
      ],
      verify: 'Refresh Performance and confirm CPU returns to a normal baseline without the same process immediately climbing again.',
      askQuery: 'What is causing my high CPU usage?',
      tone: 'red',
    });
  }

  if (intent === 'disk' || diskSignal) {
    add({
      title: 'Recover disk space safely',
      why: 'Low free space can slow updates, caches, and everyday writes. Cleanup should preview candidates and verify what was actually removed.',
      steps: [
        'Run Storage and review the largest categories and individual candidate paths.',
        'Preview the cleanup set, then remove only temporary files, caches, and downloads you recognize.',
        'Recheck large folders after cleanup; keep personal files and recovery data out of automatic deletion.',
      ],
      verify: 'Rescan Storage and confirm free space increased and the removed paths are no longer present.',
      askQuery: 'Why is my disk space low and what can I safely remove?',
      tone: 'blue',
    });
  }

  if (crashSignal) {
    add({
      title: 'Stabilize crashes and blue screens',
      why: 'Repeated crashes often follow one application, driver, update, or power event. The safest fix is to correlate the event before changing several things at once.',
      steps: [
        'Open Crash Intelligence and group recent events by application, driver, and stop-code category.',
        'Check Timeline and Drivers for the change immediately before the first repeat event.',
        'Update or roll back one suspected app or driver, restart, and keep the before/after result.',
      ],
      verify: 'Run another crash scan after normal use and confirm the same category does not recur.',
      askQuery: 'What is the most likely cause of my recent crashes?',
      tone: 'red',
    });
  }

  if (intent === 'startup') {
    add({
      title: 'Shorten startup time',
      why: 'Startup lag is usually the combined cost of auto-launch apps and services, not a single mysterious Windows setting.',
      steps: [
        'Open Startup and sort by impact; record the entries that launch every boot.',
        'Disable one non-essential entry at a time, keeping security and hardware utilities enabled.',
        'Restart and compare boot time before making another change.',
      ],
      verify: 'After two restarts, confirm the startup improvement and that required apps and hardware still work.',
      askQuery: 'Which startup items are safe to disable?',
      tone: 'green',
    });
  }

  if (intent === 'network') {
    add({
      title: 'Diagnose network complaints',
      why: 'Intermittent network problems can come from the adapter, driver, DNS, or the network itself. Capture evidence before applying a reset that may erase useful context.',
      steps: [
        'Capture a Device DNA snapshot and note whether the adapter is connected, degraded, or repeatedly changing state.',
        'Check the adapter driver and DNS configuration, then test the same site or service again.',
        'Only after recording the baseline, try a normal adapter restart or DNS refresh and compare the result.',
      ],
      verify: 'Repeat the same test and confirm the connection remains stable across multiple checks.',
      askQuery: 'Why is my internet or network connection unreliable?',
      tone: 'blue',
    });
  }

  if (plans.length === 0 || intent === 'general') {
    add({
      title: 'Build a baseline before changing anything',
      why: 'A baseline prevents guesswork. Compare health, processes, storage, startup, and recent events so the first fix targets the biggest verified complaint.',
      steps: [
        'Capture Health and Device DNA while the problem is happening, not only after a restart.',
        'Open Processes and Storage to identify the largest live resource or storage contributor.',
        'Apply one reversible change, then rescan the same areas so the result is measurable.',
      ],
      verify: 'Keep the before/after readings and only continue when the complaint and the metric both improve.',
      askQuery: 'What should I investigate first on this PC?',
      tone: 'green',
    });
  }

  return plans.slice(0, 4);
}

export function ComplaintSolutions({ context, findings, onAsk }: ComplaintSolutionsProps) {
  const plans = getComplaintSolutions(context, findings);

  return (
    <section className='rounded-xl border border-border bg-surface/40 p-4'>
      <div className='mb-4 flex items-start justify-between gap-3'>
        <div>
          <p className='text-xs font-semibold uppercase tracking-[0.16em] text-accent'>Action plan</p>
          <h2 className='mt-1 text-base font-semibold text-text'>Practical next steps for this PC</h2>
          <p className='mt-1 max-w-2xl text-xs text-text-muted'>
            Safe, evidence-led fixes for the complaints Copilot can see. Each plan ends with a check so you can tell whether it worked.
          </p>
        </div>
        <span className='rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent'>
          {plans.length} plan{plans.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className='grid gap-3 xl:grid-cols-2'>
        {plans.map((plan, index) => (
          <article
            key={plan.title}
            className='rounded-lg border border-border/80 bg-surface p-4 transition-colors hover:border-accent/40'
          >
            <div className='flex items-start gap-3'>
              <span
                className={
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ' +
                  (plan.tone === 'red'
                    ? 'bg-danger/15 text-danger'
                    : plan.tone === 'amber'
                      ? 'bg-warning/15 text-warning'
                      : plan.tone === 'blue'
                        ? 'bg-accent/15 text-accent'
                        : 'bg-success/15 text-success')
                }
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className='min-w-0'>
                <h3 className='text-sm font-semibold text-text'>{plan.title}</h3>
                <p className='mt-1 text-xs leading-5 text-text-muted'>{plan.why}</p>
              </div>
            </div>

            <ol className='mt-3 space-y-2 border-l border-border pl-4 text-xs leading-5 text-text-muted'>
              {plan.steps.map((step) => (
                <li key={step} className='pl-1'>
                  {step}
                </li>
              ))}
            </ol>

            <div className='mt-4 flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between'>
              <p className='flex items-start gap-2 text-xs text-text-muted'>
                <Check className='mt-0.5 h-3.5 w-3.5 shrink-0 text-success' />
                <span><span className='font-semibold text-text'>Verify:</span> {plan.verify}</span>
              </p>
              <Button size='sm' variant='secondary' onClick={() => onAsk(plan.askQuery)}>
                Ask Copilot
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
