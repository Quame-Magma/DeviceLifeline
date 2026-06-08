import { Card } from '../common/Card';

interface HealthScoreGaugeProps {
  /** Health score in 0..100; higher is healthier. */
  score: number;
}

interface ScoreBand {
  label: string;
  colorClass: string;
}

/** Maps a score to a qualitative band and a status color token. */
function scoreBand(score: number): ScoreBand {
  if (score >= 80) {
    return { label: 'Healthy', colorClass: 'text-status-success' };
  }
  if (score >= 50) {
    return { label: 'Fair', colorClass: 'text-status-warning' };
  }
  return { label: 'At risk', colorClass: 'text-status-error' };
}

/**
 * Circular HealthScore gauge. The progress ring inherits the band color via
 * `currentColor`; the track ring is neutral. The numeric score is announced to
 * assistive tech via the wrapper's `aria-label`.
 */
export function HealthScoreGauge({ score }: HealthScoreGaugeProps) {
  const clamped = Math.min(Math.max(Math.round(score), 0), 100);
  const band = scoreBand(clamped);

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <Card
      padding="lg"
      className="flex flex-col items-center justify-center gap-3"
      role="img"
      aria-label={`Health score ${clamped} out of 100: ${band.label}`}
    >
      <div className={['relative h-32 w-32', band.colorClass].join(' ')}>
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="10"
            className="text-surface-border"
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            data-testid="health-score-value"
            className="text-3xl font-bold text-text-primary"
          >
            {clamped}
          </span>
          <span className="text-2xs uppercase tracking-wide text-text-muted">
            / 100
          </span>
        </div>
      </div>
      <p
        data-testid="health-score-band"
        className={['text-sm font-semibold', band.colorClass].join(' ')}
      >
        {band.label}
      </p>
    </Card>
  );
}
