/**
 * Dropdown of mounted logical drives for volume map / VSS pickers.
 * Never asks the user to type a drive letter.
 */

import { formatBytes } from '../../lib/format';
import type { LogicalDrive } from '../../types/device.types';

export interface DriveSelectProps {
  id?: string;
  value: string;
  drives: LogicalDrive[];
  onChange: (volume: string) => void;
  disabled?: boolean;
  className?: string;
  /** Accessible name when no visible label is associated. */
  'aria-label'?: string;
}

/** Label shown in the option list, e.g. `C:\ · Windows — 120 GB free`. */
export function driveOptionLabel(drive: LogicalDrive): string {
  const letter = drive.name;
  const tag = drive.label?.trim();
  const kind = drive.isRemovable ? 'Removable' : null;
  const free = formatBytes(drive.availableBytes);
  const total = formatBytes(drive.totalBytes);
  const namePart = [tag, kind].filter(Boolean).join(' · ');
  if (namePart) {
    return `${letter} · ${namePart} — ${free} free of ${total}`;
  }
  return `${letter} — ${free} free of ${total}`;
}

/**
 * Prefer an existing selection if still present; otherwise first fixed drive,
 * then first drive, then `C:\`.
 */
export function pickDefaultDrive(
  drives: LogicalDrive[],
  current?: string | null,
): string {
  if (current) {
    const match = drives.find(
      (d) => d.name.toLowerCase() === current.toLowerCase(),
    );
    if (match) return match.name;
  }
  const fixed = drives.find((d) => !d.isRemovable);
  if (fixed) return fixed.name;
  if (drives[0]) return drives[0].name;
  return 'C:\\';
}

export function DriveSelect({
  id,
  value,
  drives,
  onChange,
  disabled,
  className,
  'aria-label': ariaLabel = 'Disk drive',
}: DriveSelectProps) {
  const options =
    drives.length > 0
      ? drives
      : [
          {
            name: value || 'C:\\',
            label: null,
            totalBytes: 0,
            availableBytes: 0,
            fileSystem: null,
            isRemovable: false,
          } satisfies LogicalDrive,
        ];

  return (
    <select
      id={id}
      className={className ?? 'field min-w-[12rem] max-w-full font-mono'}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((drive) => (
        <option key={drive.name} value={drive.name}>
          {drives.length > 0
            ? driveOptionLabel(drive)
            : `${drive.name} (unavailable)`}
        </option>
      ))}
    </select>
  );
}
