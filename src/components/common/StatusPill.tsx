interface StatusPillProps {
  children: string;
  tone?: 'neutral' | 'success' | 'warning' | 'error' | 'info';
}

const toneClass: Record<NonNullable<StatusPillProps['tone']>, string> = {
  neutral: 'border-hairline bg-surface-elevated text-text-secondary',
  success: 'border-status-success/25 bg-status-success-bg text-status-success',
  warning: 'border-status-warning/25 bg-status-warning-bg text-status-warning',
  error: 'border-status-error/25 bg-status-error-bg text-status-error',
  info: 'border-status-info/25 bg-status-info-bg text-status-info',
};

/**
 * Compact status chip — sentence case, no tracking spam.
 */
export function StatusPill({ children, tone = 'neutral' }: StatusPillProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-control border px-2 py-0.5',
        'text-2xs font-medium capitalize',
        toneClass[tone],
      ].join(' ')}
    >
      {children}
    </span>
  );
}
