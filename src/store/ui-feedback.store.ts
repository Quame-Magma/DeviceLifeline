/**
 * App-wide confirm dialogs, text prompts, and toast notifications.
 * Imperative APIs live in `lib/feedback.ts` — pages should not use window.confirm/alert.
 */

import { create } from 'zustand';

export type ConfirmTone = 'primary' | 'danger' | 'warning';
export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

export interface PromptOptions {
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** ms; 0 = sticky until dismissed */
  duration?: number;
}

interface ConfirmState extends ConfirmOptions {
  id: string;
  resolve: (ok: boolean) => void;
}

interface PromptState extends PromptOptions {
  id: string;
  resolve: (value: string | null) => void;
}

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  duration: number;
}

interface UiFeedbackStore {
  confirm: ConfirmState | null;
  prompt: PromptState | null;
  toasts: ToastItem[];

  openConfirm: (state: ConfirmState) => void;
  closeConfirm: (ok: boolean) => void;
  openPrompt: (state: PromptState) => void;
  closePrompt: (value: string | null) => void;
  pushToast: (toast: ToastItem) => void;
  dismissToast: (id: string) => void;
}

let seq = 0;
export function nextFeedbackId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

export const useUiFeedbackStore = create<UiFeedbackStore>((set, get) => ({
  confirm: null,
  prompt: null,
  toasts: [],

  openConfirm: (state) => set({ confirm: state }),
  closeConfirm: (ok) => {
    const current = get().confirm;
    if (!current) return;
    set({ confirm: null });
    current.resolve(ok);
  },

  openPrompt: (state) => set({ prompt: state }),
  closePrompt: (value) => {
    const current = get().prompt;
    if (!current) return;
    set({ prompt: null });
    current.resolve(value);
  },

  pushToast: (toast) =>
    set((s) => ({
      toasts: [...s.toasts.slice(-4), toast],
    })),

  dismissToast: (id) =>
    set((s) => ({
      toasts: s.toasts.filter((t) => t.id !== id),
    })),
}));
