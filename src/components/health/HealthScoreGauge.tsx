interface HealthScoreGaugeProps {
  /** Health score in 0..100; higher is healthier. */
  score: number;
}

interface ScoreBand {
  label: string;
  stroke: string;
  pillClass: string;
}

function scoreBand(score: number): ScoreBand {
  if (score >= 80) {
    return {
      label: 'Healthy',
      stroke: '#3dd68c',
      pillClass:
        'border-status-success/40 bg-status-success-bg text-status-success',
    };
  }
  if (score >= 50) {
    return {
      label: 'Fair',
      stroke: '#f5b942',
      pillClass:
        'border-status-warning/40 bg-status-warning-bg text-status-warning',
    };
  }
  return {
    label: 'At risk',
    // Mock uses teal arc even when at risk; keep health-green ring for brand
    stroke: '#3dd68c',
    pillClass: 'border-status-error/40 bg-status-error-bg text-status-error',
  };
}

/**
 * Health score ring matching the ChatGPT Health mock:
 * "HEALTH SCORE" caption, large number, /100, pill status badge.
 */
export function HealthScoreGauge({ score }: HealthScoreGaugeProps) {
  const clamped = Math.min(Math.max(Math.round(score), 0), 100);
  const band = scoreBand(clamped);

  const size = 148;
  const strokeWidth = 11;
  const radius = (size - strokeWidth) / 2 - 6;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div
      className="flex flex-col items-center gap-2.5"
      role="img"
      aria-label={`Health score ${clamped} out of 100: ${band.label}`}
    >
      <p className="text-2xs font-semibold uppercase tracking-wider text-text-muted">
        Health score
      </p>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="h-full w-full -rotate-90"
          aria-hidden
        >
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={band.stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="score-ring-progress"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            data-testid="health-score-value"
            className="text-4xl font-semibold tabular-nums tracking-tight text-text-primary cause-semibold"
          >
            {clamped}
          </span>
          <span className="text-2xs font-medium text-text-muted">/ 100</span>
        </div>
      </div>
      <span
        data-testid="health-score-band"
        className={[
          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-2xs font-semibold',
          band.pillClass,
        ].join(' ')}
      >
        {band.label}
      </span>
    </div>
  );
}
