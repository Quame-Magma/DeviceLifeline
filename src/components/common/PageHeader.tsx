import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** @deprecated Quiet pages no longer emphasize eyebrows; kept for compat. */
  eyebrow?: string;
  actions?: ReactNode;
  compact?: boolean;
}

/**
 * Page title block — title + optional description + actions. No loud section chrome.
 */
export function PageHeader({
  title,
  description,
  actions,
  compact = false,
}: PageHeaderProps) {
  return (
    <header
      className={[
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
        compact ? 'mb-4' : 'mb-5',
      ].join(' ')}
    >
      <div className="min-w-0 max-w-2xl">
        <h1
          className={[
            'font-semibold tracking-tight text-text-primary',
            compact ? 'text-lg' : 'text-xl',
          ].join(' ')}
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm leading-relaxed text-text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
