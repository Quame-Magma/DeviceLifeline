import { useEffect, useRef, useState } from 'react';

interface NumberTickerProps {
  value: number | null;
  className?: string;
  durationMs?: number;
  fallback?: string;
}

/**
 * Magic UI–style count-up for health scores and metrics.
 */
export function NumberTicker({
  value,
  className = '',
  durationMs = 700,
  fallback = '—',
}: NumberTickerProps) {
  const [display, setDisplay] = useState(value ?? 0);
  const previous = useRef(value ?? 0);
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (value === null) {
      return;
    }
    if (reducedMotion) {
      setDisplay(value);
      previous.current = value;
      return;
    }

    const from = previous.current;
    const to = value;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out cubic
      const eased = 1 - (1 - t) ** 3;
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        previous.current = to;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reducedMotion]);

  if (value === null) {
    return <span className={className}>{fallback}</span>;
  }

  return (
    <span className={['tabular-nums', className].filter(Boolean).join(' ')}>
      {display}
    </span>
  );
}
