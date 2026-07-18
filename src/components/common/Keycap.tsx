import type { ReactNode } from 'react';

interface KeycapProps {
  children: ReactNode;
  className?: string;
}

/**
 * Raycast-style keyboard key glyph.
 */
export function Keycap({ children, className = '' }: KeycapProps) {
  return (
    <kbd className={['keycap', className].filter(Boolean).join(' ')}>
      {children}
    </kbd>
  );
}
