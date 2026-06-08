import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** Large contextual icon or illustration element. */
  icon?: ReactNode;
  heading: string;
  body?: string;
  /** Optional CTA rendered below the body copy. */
  action?: ReactNode;
  className?: string;
}

/**
 * Standard empty state layout.
 * Every data-presenting section must use this when it has no data to show.
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
        'flex flex-col items-center justify-center gap-3 py-16 px-8 text-center',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon && (
        <span className="text-text-muted" aria-hidden="true">
          {icon}
        </span>
      )}
      <h3 className="text-base font-semibold text-text-primary">{heading}</h3>
      {body && <p className="text-sm text-text-secondary max-w-xs">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
