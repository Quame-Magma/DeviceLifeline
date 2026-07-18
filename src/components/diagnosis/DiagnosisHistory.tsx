import { formatTimestamp } from '../../lib/format';
import type { DiagnosisSession } from '../../types/device.types';

interface DiagnosisHistoryProps {
  sessions: DiagnosisSession[];
  selectedId: string | null;
  onSelect: (session: DiagnosisSession) => void;
}

/** Selectable list of past diagnosis sessions (query + time + finding count). */
export function DiagnosisHistory({
  sessions,
  selectedId,
  onSelect,
}: DiagnosisHistoryProps) {
  if (sessions.length === 0) {
    return <p className="text-xs text-text-muted">No past questions yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-1" role="list">
      {sessions.map((session) => {
        const active = session.id === selectedId;
        return (
          <li key={session.id}>
            <button
              type="button"
              data-testid={`history-${session.id}`}
              onClick={() => onSelect(session)}
              className={[
                'w-full rounded px-3 py-2 text-left',
                active
                  ? 'bg-surface-card text-text-primary'
                  : 'text-text-secondary hover:bg-surface',
              ].join(' ')}
            >
              <span className="block truncate text-xs font-medium">
                {session.query}
              </span>
              <span className="mt-0.5 block text-2xs text-text-muted">
                {formatTimestamp(session.createdAt)} · {session.findingCount}{' '}
                finding{session.findingCount === 1 ? '' : 's'}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
