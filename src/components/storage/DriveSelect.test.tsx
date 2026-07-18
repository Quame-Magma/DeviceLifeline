import { describe, expect, it } from 'vitest';
import { driveOptionLabel, pickDefaultDrive } from './DriveSelect';
import type { LogicalDrive } from '../../types/device.types';

const sample: LogicalDrive[] = [
  {
    name: 'D:\\',
    label: 'Data',
    totalBytes: 2_000_000_000_000,
    availableBytes: 500_000_000_000,
    fileSystem: 'NTFS',
    isRemovable: false,
  },
  {
    name: 'C:\\',
    label: 'Windows',
    totalBytes: 500_000_000_000,
    availableBytes: 100_000_000_000,
    fileSystem: 'NTFS',
    isRemovable: false,
  },
  {
    name: 'E:\\',
    label: 'USB',
    totalBytes: 32_000_000_000,
    availableBytes: 10_000_000_000,
    fileSystem: 'exFAT',
    isRemovable: true,
  },
];

describe('pickDefaultDrive', () => {
  it('keeps the current drive when still present', () => {
    expect(pickDefaultDrive(sample, 'D:\\')).toBe('D:\\');
  });

  it('prefers a fixed drive over removable when unset', () => {
    expect(pickDefaultDrive(sample, null)).toBe('D:\\');
  });

  it('falls back to C:\\ when no drives listed', () => {
    expect(pickDefaultDrive([], null)).toBe('C:\\');
  });
});

describe('driveOptionLabel', () => {
  it('includes letter, label, and free space', () => {
    const label = driveOptionLabel(sample[1]!);
    expect(label).toContain('C:\\');
    expect(label).toContain('Windows');
    expect(label).toContain('free');
  });
});
