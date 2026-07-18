import type { ComponentType, ReactNode } from 'react';

// Lucide icons accept className + strokeWidth; keep loose for flexibility.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IconComponent = ComponentType<any>;

interface SettingsSectionProps {
  icon: IconComponent;
  title: string;
  description?: string;
  children: ReactNode;
}

/**
 * Windows 11 Settings category card — solid surface, 8px radius, quiet header.
 */
export function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: SettingsSectionProps) {
  return (
    <section className="overflow-hidden rounded-card border border-hairline bg-surface">
      <header className="flex items-start gap-3 border-b border-hairline px-4 py-3.5">
        <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-control bg-surface-elevated text-text-secondary">
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-text-primary">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-text-muted">
              {description}
            </p>
          ) : null}
        </div>
      </header>
      <div className="divide-y divide-hairline">{children}</div>
    </section>
  );
}

interface SettingsRowProps {
  label: string;
  description?: string;
  children: ReactNode;
}

/**
 * Single Settings row: label left, control right (Fluent pattern).
 */
export function SettingsRow({
  label,
  description,
  children,
}: SettingsRowProps) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0 sm:max-w-[55%]">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-text-muted">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex flex-shrink-0 flex-wrap items-center justify-start gap-2 sm:justify-end">
        {children}
      </div>
    </div>
  );
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

/**
 * Windows-style toggle (pill track) — monochrome, not accent-cyan.
 */
export function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-150 ease-ray',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25',
        'disabled:cursor-not-allowed disabled:opacity-40',
        checked ? 'bg-white' : 'bg-surface-card border border-hairline',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'absolute top-0.5 h-5 w-5 rounded-full transition-transform duration-150 ease-ray',
          checked
            ? 'translate-x-[22px] bg-text-inverse'
            : 'translate-x-0.5 bg-text-muted',
        ].join(' ')}
      />
    </button>
  );
}
