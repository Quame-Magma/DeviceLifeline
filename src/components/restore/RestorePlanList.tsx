import type { RestorePlan } from '../../types/device.types';
import { EmptyState } from '../common/EmptyState';

interface RestorePlanListProps {
  plans: RestorePlan[];
  selectedId: string | null;
  onSelect: (planId: string) => void;
}

/**
 * Selectable list of restore plans shown in the Recovery Center left panel.
 * Displays the plan name, creation date, and step count.
 */
export function RestorePlanList({
  plans,
  selectedId,
  onSelect,
}: RestorePlanListProps) {
  if (plans.length === 0) {
    return (
      <EmptyState
        heading="No restore plans"
        body="Select a snapshot above and create a plan to get started."
        className="py-10 px-3"
      />
    );
  }

  return (
    <ul className="space-y-0.5 px-2 py-2" role="list">
      {plans.map((plan) => {
        const isActive = plan.id === selectedId;
        const shortDate = plan.createdAt.slice(0, 10);

        return (
          <li key={plan.id}>
            <button
              type="button"
              onClick={() => onSelect(plan.id)}
              aria-current={isActive ? 'true' : undefined}
              className={[
                'flex w-full flex-col gap-0.5 rounded px-3 py-2 text-left text-sm',
                'transition-colors duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                isActive
                  ? 'bg-accent/10 border-l-[3px] border-accent pl-[9px]'
                  : 'border-l-[3px] border-transparent pl-[9px] hover:bg-surface/60',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span
                className={[
                  'font-medium truncate',
                  isActive ? 'text-accent' : 'text-text-primary',
                ].join(' ')}
              >
                {plan.name}
              </span>
              <span className="text-xs text-text-muted">
                {shortDate} &middot; {plan.stepCount} steps
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
