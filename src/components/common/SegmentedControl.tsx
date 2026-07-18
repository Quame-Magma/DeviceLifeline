interface SegmentOption<T extends string> {
  id: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (id: T) => void;
  ariaLabel: string;
}

/**
 * Raycast/Fluent segmented control for page view modes.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      className="inline-flex rounded-control border border-hairline bg-surface p-0.5"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={active}
            className={[
              'rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors duration-100',
              active
                ? 'bg-surface-card text-text-primary'
                : 'text-text-muted hover:text-text-primary',
            ].join(' ')}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
