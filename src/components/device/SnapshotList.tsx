import type { DeviceDnaSnapshot } from '../../types/device.types';
import { shortId, formatTimestamp } from '../../lib/format';

interface SnapshotListProps {
  snapshots: DeviceDnaSnapshot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Scrollable list of Device DNA snapshots.
 * Each item shows a short ID, capture timestamp, and software item count badge.
 * The currently selected item is highlighted.
 */
export function SnapshotList({
  snapshots,
  selectedId,
  onSelect,
}: SnapshotListProps) {
  if (snapshots.length === 0) {
    return (
      <p className="px-3 py-4 text-xs text-text-muted text-center">
        No snapshots
      </p>
    );
  }

  return (
    <ul className="space-y-1 p-2" role="listbox" aria-label="Snapshots">
      {snapshots.map((snap) => {
        const isSelected = snap.id === selectedId;
        return (
          <li key={snap.id} role="option" aria-selected={isSelected}>
            <button
              type="button"
              onClick={() => onSelect(snap.id)}
              className={[
                'w-full rounded px-3 py-2.5 text-left text-sm transition-colors duration-100',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                isSelected
                  ? 'bg-accent-subtle border border-accent/30 text-text-primary'
                  : 'hover:bg-surface text-text-secondary hover:text-text-primary border border-transparent',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-text-primary">
                  #{shortId(snap.id)}
                </span>
              </div>
              <p className="mt-1 text-xs text-text-muted leading-tight">
                {formatTimestamp(snap.capturedAt)}
              </p>
              <p className="mt-0.5 text-2xs text-text-muted/70">
                {snap.softwareCount} apps · {snap.configCount} config
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
