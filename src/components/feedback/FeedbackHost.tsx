import { ConfirmDialog } from './ConfirmDialog';
import { PromptDialog } from './PromptDialog';
import { ToastHost } from './ToastHost';

/** Mount once in AppShell — dialogs + toasts for the whole app. */
export function FeedbackHost() {
  return (
    <>
      <ConfirmDialog />
      <PromptDialog />
      <ToastHost />
    </>
  );
}
