import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  titleExtra?: ReactNode;
  /** @deprecated Quiet pages no longer emphasize eyebrows; kept for compat. */
  eyebrow?: string;
  actions?: ReactNode;
  compact?: boolean;
}

/**
 * Page title block matching Overview:
 * text-xl/2xl title, short muted subtitle, actions top-right — same flex gap as greeting row.
 */
export function PageHeader({
  title,
  description,
  icon,
  titleExtra,
  actions,
  compact = false,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 max-w-2xl">
        <h1
          className={[
            'flex items-center gap-3 font-semibold tracking-tight text-text-primary cause-semibold',
            compact ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl',
          ].join(' ')}
        >
          {icon ? (
            <span className='flex h-7 w-7 shrink-0 items-center justify-center text-accent'>
              {icon}
            </span>
          ) : null}
          {title}
          {titleExtra ? <span className="shrink-0">{titleExtra}</span> : null}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 self-start">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
