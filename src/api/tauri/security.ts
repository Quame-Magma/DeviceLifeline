/**
 * Typed Tauri IPC wrappers for Behavioral Security commands.
 *
 * These are the ONLY entry points for Tauri `invoke` calls related to
 * security findings. Components and pages MUST NOT call `invoke` directly
 * (doc 48 AC-FS-04).
 *
 * Command names are snake_case (Tauri convention).
 */

import { invoke } from '@tauri-apps/api/core';
import type { SecurityFinding } from '../../types/device.types';

/** Run a security scan and persist new findings. */
export const scanSecurity = (): Promise<SecurityFinding[]> =>
  invoke<SecurityFinding[]>('scan_security');

/** List security findings, optionally including dismissed ones. */
export const listSecurityFindings = (
  includeDismissed = false,
): Promise<SecurityFinding[]> =>
  invoke<SecurityFinding[]>('list_security_findings', {
    includeDismissed,
  });

/** Dismiss a security finding so it no longer appears in the open feed. */
export const dismissSecurityFinding = (findingId: string): Promise<void> =>
  invoke<void>('dismiss_security_finding', { findingId });
