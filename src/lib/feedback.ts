/**
 * Professional UI feedback — use these instead of window.confirm / alert.
 */

import {
  nextFeedbackId,
  useUiFeedbackStore,
  type ConfirmOptions,
  type PromptOptions,
  type ToastOptions,
} from '../store/ui-feedback.store';

/** Modal confirm. Resolves true if the user confirms. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useUiFeedbackStore.getState().openConfirm({
      id: nextFeedbackId('confirm'),
      title: options.title,
      description: options.description,
      confirmLabel: options.confirmLabel ?? 'Continue',
      cancelLabel: options.cancelLabel ?? 'Cancel',
      tone: options.tone ?? 'primary',
      resolve,
    });
  });
}

/** Modal text prompt. Resolves trimmed string or null if cancelled. */
export function promptText(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    useUiFeedbackStore.getState().openPrompt({
      id: nextFeedbackId('prompt'),
      title: options.title,
      description: options.description,
      label: options.label,
      placeholder: options.placeholder,
      defaultValue: options.defaultValue ?? '',
      confirmLabel: options.confirmLabel ?? 'Continue',
      cancelLabel: options.cancelLabel ?? 'Cancel',
      resolve,
    });
  });
}

/** Floating toast notification (outcome feedback). */
export function toast(options: ToastOptions): void {
  const id = nextFeedbackId('toast');
  const duration =
    options.duration ??
    (options.tone === 'error'
      ? 8000
      : options.tone === 'warning'
        ? 6500
        : 5000);

  useUiFeedbackStore.getState().pushToast({
    id,
    title: options.title,
    description: options.description,
    tone: options.tone ?? 'info',
    duration,
  });

  if (duration > 0) {
    window.setTimeout(() => {
      useUiFeedbackStore.getState().dismissToast(id);
    }, duration);
  }
}

export function toastSuccess(title: string, description?: string): void {
  toast({ title, description, tone: 'success' });
}

export function toastError(title: string, description?: string): void {
  toast({ title, description, tone: 'error' });
}

export function toastWarning(title: string, description?: string): void {
  toast({ title, description, tone: 'warning' });
}

export function toastInfo(title: string, description?: string): void {
  toast({ title, description, tone: 'info' });
}
