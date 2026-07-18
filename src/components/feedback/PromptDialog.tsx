import { useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { Button } from '../common/Button';
import { useUiFeedbackStore } from '../../store/ui-feedback.store';

/**
 * Modal text prompt — replaces browser window.prompt.
 */
export function PromptDialog() {
  const prompt = useUiFeedbackStore((s) => s.prompt);
  const closePrompt = useUiFeedbackStore((s) => s.closePrompt);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!prompt) return;
    setValue(prompt.defaultValue ?? '');
  }, [prompt]);

  useEffect(() => {
    if (!prompt) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePrompt(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prompt, closePrompt]);

  if (!prompt) return null;

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    closePrompt(trimmed);
  };

  return (
    <div
      className="smoke-overlay fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closePrompt(null);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-dialog-title"
        data-testid="prompt-dialog"
        className="w-full max-w-md overflow-hidden rounded-overlay border border-hairline bg-surface-elevated shadow-elevated animate-scale-in"
      >
        <div className="flex gap-4 px-panel-x py-5">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-control bg-accent-subtle text-accent">
            <FolderOpen className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="prompt-dialog-title"
              className="text-base font-semibold tracking-tight text-text-primary cause-semibold"
            >
              {prompt.title}
            </h2>
            {prompt.description ? (
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                {prompt.description}
              </p>
            ) : null}
            <label className="mt-4 block">
              {prompt.label ? (
                <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-wide text-text-muted">
                  {prompt.label}
                </span>
              ) : null}
              <input
                type="text"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={prompt.placeholder}
                className="field font-mono"
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline bg-surface-card/40 px-panel-x py-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => closePrompt(null)}
          >
            {prompt.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={value.trim().length === 0}
            onClick={submit}
          >
            {prompt.confirmLabel ?? 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}
