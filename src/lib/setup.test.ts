import { describe, it, expect } from 'vitest';
import { setupFilename, bundleToJson } from './setup';
import type { SetupBundle } from '../types/device.types';

const BUNDLE: SetupBundle = {
  formatVersion: 1,
  exportedAt: '2026-06-08T14:32:00Z',
  sourceHostname: 'DESKTOP-ABC',
  snapshot: {
    id: 's1',
    deviceId: 'd1',
    capturedAt: '2026-06-08T14:00:00Z',
    schemaVersion: 1,
    source: 'manual',
    softwareCount: 2,
    configCount: 1,
  },
  software: [],
  config: [],
  checksum: 'abc123',
};

describe('setupFilename', () => {
  it('combines a sanitized hostname and the export date', () => {
    expect(setupFilename(BUNDLE)).toBe('DESKTOP-ABC-2026-06-08.dlsetup');
  });

  it('sanitizes unusual hostname characters', () => {
    expect(setupFilename({ ...BUNDLE, sourceHostname: 'my pc!!' })).toBe(
      'my-pc-2026-06-08.dlsetup',
    );
  });

  it('falls back to "device" when the hostname is empty', () => {
    expect(setupFilename({ ...BUNDLE, sourceHostname: '' })).toBe(
      'device-2026-06-08.dlsetup',
    );
  });
});

describe('bundleToJson', () => {
  it('produces JSON that round-trips back to the bundle', () => {
    const json = bundleToJson(BUNDLE);
    expect(JSON.parse(json)).toEqual(BUNDLE);
  });
});
