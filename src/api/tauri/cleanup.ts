import { invoke } from '@tauri-apps/api/core';
import type { CleanupPreview, CleanupResult } from '../../types/device.types';

export const scanCleanupPreview = (): Promise<CleanupPreview> =>
  invoke<CleanupPreview>('scan_cleanup_preview');

export const executeCleanup = (
  categories: string[] | null,
  confirm: boolean,
): Promise<CleanupResult> =>
  invoke<CleanupResult>('execute_cleanup', { categories, confirm });
