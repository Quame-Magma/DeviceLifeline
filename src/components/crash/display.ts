import type { CrashEvent } from '../../types/device.types';

/**
 * Pure display helpers for Crash Intelligence — category labels, severity
 * presentation, and plain-English event explanations. No React, no side effects,
 * so they are unit-testable.
 */

/** Human-readable labels for crash categories. */
export const CATEGORY_LABELS: Record<string, string> = {
  bsod: 'Blue screen (BSOD)',
  app_crash: 'App crash',
  app_hang: 'App hang',
  kernel_power: 'Power / kernel',
  unexpected_shutdown: 'Unexpected shutdown',
  unknown: 'Other',
};

/** Returns a human-readable label for a crash category. */
export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? 'Other';
}

/** Presentation metadata for a severity level. */
export interface SeverityMeta {
  /** Capitalized display label. */
  label: string;
  /** Tailwind classes for the severity badge. */
  badgeClass: string;
  /** Sort rank — lower is more severe. */
  rank: number;
}

const SEVERITY: Record<string, SeverityMeta> = {
  critical: {
    label: 'Critical',
    badgeClass: 'bg-status-error-bg text-status-error border-status-error/30',
    rank: 0,
  },
  error: {
    label: 'Error',
    badgeClass:
      'bg-status-warning-bg text-status-warning border-status-warning/30',
    rank: 1,
  },
  warning: {
    label: 'Warning',
    badgeClass: 'bg-surface text-text-secondary border-surface-border',
    rank: 2,
  },
};

/** Returns presentation metadata for a severity, with a neutral fallback. */
export function severityMeta(severity: string): SeverityMeta {
  return (
    SEVERITY[severity] ?? {
      label: severity,
      badgeClass: 'bg-surface text-text-secondary border-surface-border',
      rank: 3,
    }
  );
}

export interface CrashExplanation {
  heading: string;
  whatHappened: string;
  likelyCause: string;
  recommendedAction: string;
}

function firstMatch(value: string | null, patterns: RegExp[]): string | null {
  if (!value) {
    return null;
  }
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function appName(event: CrashEvent): string | null {
  return firstMatch(event.detail, [
    /Faulting application name:\s*([^,\r\n]+)/i,
    /Faulting application path:\s*([^,\r\n]+)/i,
    /The program\s+([^\s]+)\s+version/i,
  ]);
}

function moduleName(event: CrashEvent): string | null {
  return firstMatch(event.detail, [
    /Faulting module name:\s*([^,\r\n]+)/i,
    /Faulting module path:\s*([^,\r\n]+)/i,
  ]);
}

function exceptionCode(event: CrashEvent): string | null {
  return firstMatch(event.detail, [/Exception code:\s*([^,\r\n]+)/i]);
}

function bugCheckCode(event: CrashEvent): string | null {
  return firstMatch(event.detail, [/(BugCheck\s+0x[0-9a-f]+)/i]);
}

function fileName(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return value.split(/[\\/]/).pop() ?? value;
}

/**
 * Converts raw Windows crash/event-log fields into a user-facing explanation.
 * The raw detail remains available separately for technical review.
 */
export function explainCrashEvent(event: CrashEvent): CrashExplanation {
  const app = fileName(appName(event));
  const module = fileName(moduleName(event));
  const exception = exceptionCode(event);
  const bugCheck = bugCheckCode(event);

  if (event.category === 'bsod') {
    return {
      heading: 'Windows crashed and restarted to protect the system.',
      whatHappened: bugCheck
        ? `Windows recorded a blue-screen crash with ${bugCheck}.`
        : 'Windows recorded a blue-screen crash, also called a bugcheck.',
      likelyCause:
        'Blue screens are usually caused by a faulty driver, a low-level Windows component, overheating, memory problems, or recent hardware/software changes.',
      recommendedAction:
        'Review drivers or Windows updates installed around this time. If the same stop code repeats, prioritize driver rollback/update and memory/storage checks.',
    };
  }

  if (event.category === 'kernel_power') {
    return {
      heading: 'The PC restarted without shutting down cleanly.',
      whatHappened:
        'Windows saw the machine come back after an unsafe restart or power interruption.',
      likelyCause:
        'Common causes are power loss, holding the power button, battery/charger issues, overheating, or a freeze that forced a hard reset.',
      recommendedAction:
        'If there was no known power outage, check power cable/battery stability, overheating, and crash events immediately before this restart.',
    };
  }

  if (event.category === 'unexpected_shutdown') {
    return {
      heading: 'Windows detected an unexpected shutdown.',
      whatHappened:
        'The previous session ended without the normal shutdown sequence finishing.',
      likelyCause:
        'This often follows a forced restart, drained battery, power interruption, or a system hang.',
      recommendedAction:
        'Look for a critical power or blue-screen event at the same time. Repeated unexpected shutdowns should be treated as a stability problem.',
    };
  }

  if (event.category === 'app_hang') {
    return {
      heading: app
        ? `${app} stopped responding.`
        : 'An application stopped responding.',
      whatHappened:
        'Windows closed or recovered an app that stopped answering system messages.',
      likelyCause:
        'This is usually isolated to the app, a plugin/extension, graphics/input services, or pressure from low memory/disk resources.',
      recommendedAction:
        'If it repeats for the same app, update or repair that app. If many apps hang, check memory pressure, disk saturation, and recent system changes.',
    };
  }

  if (event.category === 'app_crash') {
    const affected = app ? `${app} crashed` : 'An application crashed';
    const moduleText = module ? ` The failing component was ${module}.` : '';
    const exceptionText = exception ? ` Windows reported ${exception}.` : '';
    return {
      heading: `${affected}.`,
      whatHappened: `${affected} and Windows recorded the failure.${moduleText}${exceptionText}`,
      likelyCause:
        'Most app crashes are caused by the app itself, a shared Windows component, a driver, or an integration the app loads at startup.',
      recommendedAction:
        'If this is a one-off, monitor it. If the same app repeats, update or repair the app and check whether the named module points to a driver or Windows component.',
    };
  }

  return {
    heading: event.title,
    whatHappened:
      'Windows recorded a stability event that DeviceLifeline could not classify more specifically yet.',
    likelyCause:
      'The event source and ID may still be useful, but more context is needed before naming a likely cause.',
    recommendedAction:
      'Check nearby crash, power, and app events. Re-scan after the next incident to see whether a pattern emerges.',
  };
}
