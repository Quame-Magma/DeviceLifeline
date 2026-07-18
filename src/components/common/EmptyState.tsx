import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  heading: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Quiet empty state on solid surfaces.
 */
export function EmptyState({
  icon,
  heading,
  body,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-3 px-8 py-14 text-center animate-fade-up',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon ? (
        <span className="text-text-muted opacity-70" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <h3 className="text-base font-semibold text-text-primary cause-semibold">
        {heading}
      </h3>
      {body ? (
        <p className="max-w-sm text-sm leading-relaxed text-text-muted">
          {body}
        </p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
