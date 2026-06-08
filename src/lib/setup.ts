/**
 * Pure helpers for Setup Export / Import. No React, no side effects.
 */

import type { SetupBundle } from '../types/device.types';

/**
 * Builds a safe download filename for a setup bundle, e.g.
 * `"DESKTOP-ABC-2026-06-08.dlsetup"`. Non-alphanumeric characters in the
 * hostname are collapsed to hyphens.
 */
export function setupFilename(bundle: SetupBundle): string {
  const host = (bundle.sourceHostname || 'device')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const date = bundle.exportedAt.slice(0, 10);
  const base = host.length > 0 ? host : 'device';
  return `${base}-${date}.dlsetup`;
}

/** Serializes a bundle to indented JSON suitable for writing to a file. */
export function bundleToJson(bundle: SetupBundle): string {
  return JSON.stringify(bundle, null, 2);
}
