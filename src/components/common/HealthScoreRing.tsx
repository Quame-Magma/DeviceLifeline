import { NumberTicker } from '../motion/NumberTicker';

interface HealthScoreRingProps {
  score: number | null;
  size?: number;
  stroke?: number;
  label?: string;
  checking?: boolean;
}

function ringColor(score: number | null): string {
  if (score === null) {
    return 'rgba(255,255,255,0.35)';
  }
  if (score >= 80) {
    return '#59d499';
  }
  if (score >= 50) {
    return '#ffc533';
  }
  return '#ff6161';
}

/**
 * Quiet health ring — semantic stroke only, no glow / pulse chrome.
 */
export function HealthScoreRing({
  score,
  size = 168,
  stroke = 8,
  label = 'Health score',
  checking = false,
}: HealthScoreRingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = score === null ? 0 : Math.min(100, Math.max(0, score));
  const offset = circumference - (value / 100) * circumference;
  const color = ringColor(score);

  return (
    <div
      className="relative mx-auto flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          className="score-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="score-ring-progress"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {checking ? (
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-text-muted border-t-transparent" />
        ) : (
          <>
            <span
              className="text-4xl font-semibold tracking-tight sm:text-5xl"
              style={{ color }}
            >
              <NumberTicker value={score} className="tabular-nums" />
            </span>
            <span className="mt-1 text-2xs font-medium uppercase tracking-wider text-text-muted">
              {label}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
