import { useEffect } from 'react';
import { AlertTriangle, HelpCircle, ShieldAlert } from 'lucide-react';
import { Button } from '../common/Button';
import { useUiFeedbackStore } from '../../store/ui-feedback.store';

/**
 * Centered modal for destructive / important confirmations.
 * Replaces browser window.confirm ("localhost says…").
 */
export function ConfirmDialog() {
  const confirm = useUiFeedbackStore((s) => s.confirm);
  const closeConfirm = useUiFeedbackStore((s) => s.closeConfirm);

  useEffect(() => {
    if (!confirm) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeConfirm(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm, closeConfirm]);

  if (!confirm) return null;

  const tone = confirm.tone ?? 'primary';
  const Icon =
    tone === 'danger'
      ? ShieldAlert
      : tone === 'warning'
        ? AlertTriangle
        : HelpCircle;
  const iconClass =
    tone === 'danger'
      ? 'bg-status-error-bg text-status-error'
      : tone === 'warning'
        ? 'bg-status-warning-bg text-status-warning'
        : 'bg-accent-subtle text-accent';
  const confirmVariant =
    tone === 'danger' ? 'danger' : tone === 'warning' ? 'primary' : 'primary';

  return (
    <div
      className="smoke-overlay fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeConfirm(false);
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={
          confirm.description ? 'confirm-dialog-desc' : undefined
        }
        data-testid="confirm-dialog"
        className="w-full max-w-md overflow-hidden rounded-overlay border border-hairline bg-surface-elevated shadow-elevated animate-scale-in"
      >
        <div className="flex gap-4 px-panel-x py-5">
          <span
            className={[
              'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-control',
              iconClass,
            ].join(' ')}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="confirm-dialog-title"
              className="text-base font-semibold tracking-tight text-text-primary cause-semibold"
            >
              {confirm.title}
            </h2>
            {confirm.description ? (
              <p
                id="confirm-dialog-desc"
                className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-secondary"
              >
                {confirm.description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline bg-surface-card/40 px-panel-x py-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => closeConfirm(false)}
          >
            {confirm.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            variant={confirmVariant}
            size="sm"
            onClick={() => closeConfirm(true)}
            autoFocus
          >
            {confirm.confirmLabel ?? 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}
