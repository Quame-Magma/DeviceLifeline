import type { ReactNode } from 'react';
import { PageHeader } from '../common/PageHeader';

interface PageShellProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Wider content (matches Overview). Default true. */
  wide?: boolean;
  /** Slightly smaller title — for dense tool surfaces. */
  compact?: boolean;
  /** Extra classes on the outer shell (e.g. flex growth, narrower max-width). */
  className?: string;
}

/**
 * Shared page chrome aligned with Overview:
 * title + description + actions, consistent horizontal padding and section spacing.
 */
export function PageShell({
  title,
  description,
  actions,
  children,
  wide = true,
  compact = false,
  className = '',
}: PageShellProps) {
  return (
    <div
      className={[
        'page-shell page-section',
        // Keep Overview width unless a page opts narrower (Settings).
        wide ? '' : '!max-w-3xl',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <PageHeader
        title={title}
        description={description}
        actions={actions}
        compact={compact}
      />
      {children}
    </div>
  );
}
