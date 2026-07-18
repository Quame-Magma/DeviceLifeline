import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import {
  useUiFeedbackStore,
  type ToastTone,
} from '../../store/ui-feedback.store';

const toneStyles: Record<
  ToastTone,
  { bar: string; icon: string; Icon: typeof Info }
> = {
  success: {
    bar: 'border-status-success/30',
    icon: 'text-status-success',
    Icon: CheckCircle2,
  },
  error: {
    bar: 'border-status-error/30',
    icon: 'text-status-error',
    Icon: XCircle,
  },
  warning: {
    bar: 'border-status-warning/30',
    icon: 'text-status-warning',
    Icon: AlertTriangle,
  },
  info: {
    bar: 'border-status-info/30',
    icon: 'text-status-info',
    Icon: Info,
  },
};

/**
 * Floating toast stack for action outcomes (cleanup finished, error, etc.).
 * Professional overlay — not an inline banner stuffed into the page.
 */
export function ToastHost() {
  const toasts = useUiFeedbackStore((s) => s.toasts);
  const dismissToast = useUiFeedbackStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-5 right-5 z-[70] flex w-full max-w-sm flex-col gap-2 p-0"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((t) => {
        const style = toneStyles[t.tone];
        const Icon = style.Icon;
        return (
          <div
            key={t.id}
            role="status"
            data-testid="toast"
            className={[
              'pointer-events-auto flex gap-3 rounded-card border bg-surface-elevated px-panel-x py-panel-y shadow-elevated animate-fade-up',
              style.bar,
            ].join(' ')}
          >
            <Icon
              className={['mt-0.5 h-5 w-5 flex-shrink-0', style.icon].join(' ')}
              strokeWidth={1.75}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text-primary cause-semibold">
                {t.title}
              </p>
              {t.description ? (
                <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                  {t.description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-control text-text-muted hover:bg-surface-card hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
