/**
 * Typed Tauri IPC wrappers for Recovery Vault commands.
 *
 * These are the ONLY entry points for Tauri `invoke` calls related to
 * vault entries. Components and pages MUST NOT call `invoke` directly
 * (doc 48 AC-FS-04).
 *
 * Command names are snake_case (Tauri convention).
 */

import { invoke } from '@tauri-apps/api/core';
import type { VaultEntry } from '../../types/device.types';

/** List vault entries for the local device, newest first. */
export const listVaultEntries = (): Promise<VaultEntry[]> =>
  invoke<VaultEntry[]>('list_vault_entries');

/** Create a system restore point (or platform equivalent record). */
export const createRestorePoint = (
  description?: string | null,
): Promise<VaultEntry> =>
  invoke<VaultEntry>('create_restore_point', {
    description: description ?? null,
  });

/** Export a DNA vault backup of device baseline data. */
export const createDnaVaultBackup = (): Promise<VaultEntry> =>
  invoke<VaultEntry>('create_dna_vault_backup');

/** Create a directory image from a source path. */
export const createDirectoryImage = (sourcePath: string): Promise<VaultEntry> =>
  invoke<VaultEntry>('create_directory_image', { sourcePath });
