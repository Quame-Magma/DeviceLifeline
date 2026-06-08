import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

/**
 * Surface card atom. Provides a white rounded container with a subtle shadow.
 */
export function Card({
  children,
  padding = 'md',
  className = '',
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        'rounded-card bg-surface-card shadow-card border border-surface-border',
        paddingClasses[padding],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
