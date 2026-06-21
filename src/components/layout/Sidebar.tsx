import {
  Activity,
  ArchiveRestore,
  BrainCircuit,
  HeartPulse,
  History,
  LayoutDashboard,
  PackageCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { APP_NAME } from '../../lib/constants';
import iconAsset from '../../assets/icon.png';

export type View =
  | 'dashboard'
  | 'device-dna'
  | 'timeline'
  | 'recovery-center'
  | 'health'
  | 'crash-intelligence'
  | 'ai-detective';

interface NavItem {
  id: View;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operate',
    items: [
      { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
      { id: 'device-dna', label: 'Device Baseline', icon: PackageCheck },
      { id: 'recovery-center', label: 'Recovery Plans', icon: ArchiveRestore },
      { id: 'timeline', label: 'Change Timeline', icon: History },
    ],
  },
  {
    label: 'Investigate',
    items: [
      { id: 'health', label: 'Health', icon: HeartPulse },
      { id: 'crash-intelligence', label: 'Crash Analysis', icon: TriangleAlert },
    ],
  },
  {
    label: 'Assist',
    items: [{ id: 'ai-detective', label: 'Diagnosis', icon: BrainCircuit }],
  },
];

interface SidebarProps {
  activeView: View;
  onNavigate: (view: View) => void;
}

/**
 * Persistent dark left sidebar with brand header and navigation items.
 */
export function Sidebar({ activeView, onNavigate }: SidebarProps) {
  return (
    <aside className="flex h-full w-[248px] flex-shrink-0 flex-col bg-sidebar">
      <div className="flex h-20 items-center border-b border-sidebar-border px-4">
        <div className="flex min-w-0 items-center gap-3" aria-label={APP_NAME}>
          <img
            src={iconAsset}
            alt=""
            aria-hidden="true"
            className="h-12 w-12 flex-shrink-0 object-contain"
          />
          <span className="min-w-0 text-lg font-semibold tracking-normal text-text-inverse">
            Device<span className="text-accent-muted">Lifeline</span>
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4" aria-label="Main navigation">
        <div className="space-y-5 px-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-2 pb-1.5 text-2xs font-semibold uppercase tracking-wide text-text-inverse-muted">
                {group.label}
              </p>
              <ul className="space-y-1" role="list">
                {group.items.map((item) => {
                  const isActive = item.id === activeView;
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onNavigate(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={[
                          'flex w-full items-center gap-3 rounded px-3 py-2.5 text-left text-sm font-medium',
                          'transition-colors duration-150',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                          isActive
                            ? 'bg-sidebar-active text-text-inverse shadow-sm'
                            : 'text-text-inverse-muted hover:bg-sidebar-hover hover:text-text-inverse',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <Icon
                          aria-hidden="true"
                          className={[
                            'h-4 w-4 flex-shrink-0',
                            isActive ? 'text-accent-muted' : 'text-current',
                          ].join(' ')}
                          strokeWidth={2}
                        />
                        <span className="min-w-0 truncate">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <div className="border-t border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-2 text-2xs text-text-inverse-muted">
          <Activity aria-hidden="true" className="h-3.5 w-3.5 text-accent-muted" />
          <span>Local MVP · v0.1.2</span>
        </div>
      </div>
    </aside>
  );
}
