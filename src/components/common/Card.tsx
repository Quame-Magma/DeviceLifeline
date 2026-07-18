import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** One step up the surface ladder */
  strong?: boolean;
}

const paddingClasses = {
  none: '',
  sm: 'px-panel-x py-3',
  md: 'px-panel-x py-panel-y',
  lg: 'px-panel-x py-5',
};

/**
 * Solid navy card matching Overview shell (hairline + surface-card).
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
        'rounded-card border border-hairline shadow-card',
        strong ? 'bg-surface-elevated' : 'bg-surface-card',
        'transition-colors duration-150 ease-ray',
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
