import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover focus-visible:ring-accent disabled:bg-accent/50',
  secondary:
    'bg-white text-text-primary border border-surface-border hover:bg-surface focus-visible:ring-accent disabled:opacity-50',
  ghost:
    'bg-transparent text-text-secondary hover:bg-surface focus-visible:ring-accent disabled:opacity-40',
  danger:
    'bg-status-error text-white hover:bg-red-600 focus-visible:ring-red-400 disabled:opacity-50',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2',
};

/**
 * Primary interactive button atom.
 * Supports multiple variants, sizes, and a loading state.
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
        'inline-flex items-center justify-center rounded font-medium',
        'transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
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
