import { describe, it, expect } from 'vitest';
import { syncStatusLabel } from './sync';
import type { SyncStatus } from '../types/device.types';

const status = (over: Partial<SyncStatus>): SyncStatus => ({
  configured: false,
  pending: 0,
  synced: 0,
  failed: 0,
  ...over,
});

describe('syncStatusLabel', () => {
  it('reports not configured with a queue count', () => {
    expect(syncStatusLabel(status({ pending: 3 }))).toBe(
      'Not configured — 3 items queued locally',
    );
  });

  it('uses the singular noun for one queued item', () => {
    expect(syncStatusLabel(status({ pending: 1 }))).toBe(
      'Not configured — 1 item queued locally',
    );
  });

  it('reports not configured with an empty queue', () => {
    expect(syncStatusLabel(status({}))).toBe('Not configured');
  });

  it('reports pending when configured with a backlog', () => {
    expect(syncStatusLabel(status({ configured: true, pending: 2 }))).toBe(
      '2 pending',
    );
  });

  it('reports up to date when configured and drained', () => {
    expect(syncStatusLabel(status({ configured: true, synced: 5 }))).toBe(
      'Up to date',
    );
  });
});
