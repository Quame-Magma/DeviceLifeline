/**
 * Typed Tauri IPC wrappers for Setup Export / Import commands.
 *
 * These are the ONLY entry points for Tauri `invoke` calls related to setup
 * bundles. Components and pages MUST NOT call `invoke` directly (doc 48
 * AC-FS-04).
 *
 * Command names are snake_case (Tauri convention); argument keys are camelCase.
 */

import { invoke } from '@tauri-apps/api/core';
import type { DeviceDnaSnapshot, SetupBundle } from '../../types/device.types';

/** Build a portable, checksummed setup bundle from a snapshot. */
export const exportSetup = (snapshotId: string): Promise<SetupBundle> =>
  invoke<SetupBundle>('export_setup', { snapshotId });

/** Import a setup bundle (verifying its checksum) as a new local snapshot. */
export const importSetup = (bundleJson: string): Promise<DeviceDnaSnapshot> =>
  invoke<DeviceDnaSnapshot>('import_setup', { bundleJson });
