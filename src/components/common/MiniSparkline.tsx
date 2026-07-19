interface MiniSparklineProps {
  values: number[];
  stroke: string;
  className?: string;
  /** SVG width viewBox units. Default 64. */
  width?: number;
  /** SVG height viewBox units. Default 28. */
  height?: number;
}

/**
 * Compact line sparkline for metric tiles and dense table rows.
 */
export function MiniSparkline({
  values,
  stroke,
  className,
  width = 64,
  height = 28,
}: MiniSparklineProps) {
  if (values.length < 2) {
    return null;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * width;
      const y = height - ((v - min) / span) * (height - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
