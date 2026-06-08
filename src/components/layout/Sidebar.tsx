import { APP_NAME } from '../../lib/constants';

export type View = 'dashboard' | 'device-dna' | 'timeline';

interface NavItem {
  id: View;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
  { id: 'device-dna', label: 'Device DNA', icon: '◉' },
  { id: 'timeline', label: 'Timeline', icon: '◷' },
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
    <aside className="flex h-full w-[220px] flex-shrink-0 flex-col bg-sidebar">
      {/* Brand header */}
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        <span
          className="flex h-7 w-7 items-center justify-center rounded bg-accent text-white text-sm font-bold"
          aria-hidden="true"
        >
          DL
        </span>
        <span className="text-sm font-semibold text-text-inverse tracking-wide">
          {APP_NAME}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3" aria-label="Main navigation">
        <ul className="space-y-0.5 px-2" role="list">
          {NAV_ITEMS.map((item) => {
            const isActive = item.id === activeView;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={[
                    'flex w-full items-center gap-3 rounded px-3 py-2 text-sm font-medium',
                    'transition-colors duration-150',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    isActive
                      ? 'bg-sidebar-active border-l-[3px] border-accent text-text-inverse pl-[9px]'
                      : 'text-text-inverse-muted hover:bg-sidebar-hover hover:text-text-inverse border-l-[3px] border-transparent pl-[9px]',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span aria-hidden="true" className="text-base leading-none">
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Sidebar footer */}
      <div className="border-t border-sidebar-border px-4 py-3">
        <p className="text-2xs text-text-inverse-muted">Increment 1 · v0.1.0</p>
      </div>
    </aside>
  );
}
