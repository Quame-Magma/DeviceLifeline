interface SpinnerProps {
  /** Accessible label for screen readers. */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-7 w-7 border-2',
  lg: 'h-10 w-10 border-[3px]',
};

/**
 * Circular loading spinner.
 * Use for action-in-progress states (button loading, inline refresh).
 * Prefer skeleton screens for full content-area loading.
 */
export function Spinner({
  label = 'Loading…',
  size = 'md',
  className = '',
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={[
        'inline-block animate-spin rounded-full border-accent border-t-transparent',
        sizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}
