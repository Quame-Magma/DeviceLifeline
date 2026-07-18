import type { CSSProperties, ReactNode } from 'react';

interface BlurFadeProps {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  /** Disable animation (e.g. for tests) */
  disabled?: boolean;
}

/**
 * Magic UI–style blur + fade entrance (CSS-only, no framer-motion).
 * Surgical page/section enter — not ambient decoration.
 */
export function BlurFade({
  children,
  className = '',
  delayMs = 0,
  disabled = false,
}: BlurFadeProps) {
  const style: CSSProperties | undefined =
    !disabled && delayMs > 0 ? { animationDelay: `${delayMs}ms` } : undefined;

  return (
    <div
      className={[disabled ? '' : 'animate-blur-fade-in', className]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      {children}
    </div>
  );
}
