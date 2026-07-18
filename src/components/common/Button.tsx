import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover focus-visible:ring-accent/40 disabled:opacity-40 shadow-glow-sm',
  accent:
    'bg-accent text-white hover:bg-accent-hover focus-visible:ring-accent/40 disabled:opacity-40',
  secondary:
    'border border-hairline bg-surface-elevated/60 text-text-primary hover:bg-surface-card focus-visible:ring-accent/30 disabled:opacity-40',
  ghost:
    'bg-transparent text-text-secondary hover:bg-surface-card hover:text-text-primary focus-visible:ring-accent/30 disabled:opacity-40',
  danger:
    'bg-status-error/90 text-white hover:bg-status-error focus-visible:ring-status-error/50 disabled:opacity-40',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-10 px-5 text-sm gap-2',
};

/**
 * Raycast-style actions: white primary pill, hairline secondary, quiet ghost.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      disabled={isDisabled}
      aria-busy={loading}
      className={[
        'inline-flex items-center justify-center rounded-control font-medium',
        'transition-colors duration-150 ease-ray',
        'active:scale-[0.98]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        'cursor-pointer disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
