interface AlertBannerProps {
  title: string;
  message?: string | null;
  onRetry?: () => void;
  tone?: 'error' | 'warning' | 'info';
}

const toneClass = {
  error: 'border-status-error/30 bg-status-error-bg text-status-error',
  warning: 'border-status-warning/30 bg-status-warning-bg text-status-warning',
  info: 'border-status-info/30 bg-status-info-bg text-status-info',
} as const;

/**
 * Quiet inline alert — used on every page for errors/status.
 */
export function AlertBanner({
  title,
  message,
  onRetry,
  tone = 'error',
}: AlertBannerProps) {
  return (
    <div
      role="alert"
      className={[
        'flex items-start gap-3 rounded-card border px-4 py-3 text-sm',
        toneClass[tone],
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {message ? <p className="mt-0.5 opacity-80">{message}</p> : null}
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 text-xs font-medium underline underline-offset-2 hover:no-underline"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
