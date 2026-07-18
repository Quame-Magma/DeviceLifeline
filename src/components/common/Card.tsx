import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** One step up the surface ladder */
  strong?: boolean;
}

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

/**
 * Solid surface card with hairline border. No glass, no lift shadow.
 */
export function Card({
  children,
  padding = 'md',
  strong = false,
  className = '',
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        strong ? 'glass-panel-strong' : 'glass-panel',
        'rounded-card transition-colors duration-150 ease-ray',
        'hover:border-hairline-strong',
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
