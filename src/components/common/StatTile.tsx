import type { ComponentType, ReactNode } from 'react';

// Lucide-style icons accept className + strokeWidth.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IconComponent = ComponentType<any>;

interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
  /** Optional leading icon — matches Overview resource tiles */
  icon?: IconComponent;
  /** Colored status line under the value */
  tone?: 'success' | 'warning' | 'error' | 'muted';
}

/**
 * Metric cell matching Overview resource tiles:
 * compact card, uppercase label, dense value, optional status hint.
 */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'muted',
}: StatTileProps) {
  const hintClass =
    tone === 'success'
      ? 'text-status-success'
      : tone === 'warning'
        ? 'text-status-warning'
        : tone === 'error'
          ? 'text-status-error'
          : 'text-text-muted';

  return (
    <div className="rounded-card border border-hairline bg-surface-card px-panel-x py-panel-y shadow-card">
      <div className="flex items-center gap-1.5 text-text-muted">
        {Icon ? (
          <Icon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} />
        ) : null}
        <p className="text-2xs font-semibold uppercase tracking-wide">
          {label}
        </p>
      </div>
      <p className="mt-2 truncate text-sm font-semibold tabular-nums tracking-tight text-text-primary cause-semibold">
        {value}
      </p>
      {hint ? (
        <p className={`mt-1 truncate text-2xs ${hintClass}`}>{hint}</p>
      ) : null}
    </div>
  );
}

interface StatRowProps {
  children: ReactNode;
  columns?: 2 | 3 | 4 | 5 | 6;
}

/** Metric row — same gap-2 grid rhythm as Overview resource tiles. */
export function StatRow({ children, columns = 4 }: StatRowProps) {
  const col =
    columns === 2
      ? 'grid-cols-2'
      : columns === 3
        ? 'grid-cols-2 sm:grid-cols-3'
        : columns === 5
          ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5'
          : columns === 6
            ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6'
            : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4';
  return <div className={['grid gap-2', col].join(' ')}>{children}</div>;
}
