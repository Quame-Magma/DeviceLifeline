import type { ReactNode } from 'react';

interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
}

/**
 * Quiet metric cell — no uppercase tracking.
 */
export function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className="rounded-card border border-hairline bg-surface px-3.5 py-2.5">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight text-text-primary">
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-2xs text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

interface StatRowProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
}

export function StatRow({ children, columns = 3 }: StatRowProps) {
  const col =
    columns === 2
      ? 'sm:grid-cols-2'
      : columns === 4
        ? 'sm:grid-cols-2 lg:grid-cols-4'
        : 'sm:grid-cols-3';
  return (
    <div className={['grid grid-cols-1 gap-2', col].join(' ')}>{children}</div>
  );
}
