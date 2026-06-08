/**
 * Pure display helpers for Crash Intelligence — category labels and severity
 * presentation. No React, no side effects, so they are unit-testable.
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
