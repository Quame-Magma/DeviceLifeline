import { useEffect } from 'react';
import {
  Activity,
  Archive,
  Bot,
  Boxes,
  Brush,
  ChartLine,
  ChevronRight,
  HardDrive,
  HeartPulse,
  History,
  Home,
  LifeBuoy,
  PanelLeftClose,
  PanelLeftOpen,
  Power,
  Shield,
  ShieldCheck,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { APP_NAME } from '../../lib/constants';
import { useAgent } from '../../hooks/use-agent';
import { useElevation } from '../../hooks/use-elevation';
import iconAsset from '../../assets/icon.png';

export type View =
  | 'dashboard'
  | 'device-dna'
  | 'timeline'
  | 'recovery-center'
  | 'health'
  | 'crash-intelligence'
  | 'ai-detective'
  | 'processes'
  | 'storage'
  | 'search'
  | 'software'
  | 'hardware'
  | 'drivers'
  | 'startup'
  | 'cleanup'
  | 'system-report'
  | 'security'
  | 'vault'
  | 'settings';

interface NavItem {
  id: View;
  label: string;
  icon: LucideIcon;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ id: 'dashboard', label: 'Overview', icon: Home }],
  },
  {
    label: 'System',
    items: [
      { id: 'health', label: 'Health', icon: HeartPulse },
      { id: 'hardware', label: 'Performance', icon: Activity },
      { id: 'storage', label: 'Storage', icon: HardDrive },
      { id: 'processes', label: 'Processes', icon: ChartLine },
      { id: 'startup', label: 'Startup', icon: Power },
      { id: 'drivers', label: 'Drivers', icon: Wrench },
    ],
  },
  {
    label: 'Protection',
    items: [
      { id: 'security', label: 'Security', icon: ShieldCheck },
      { id: 'cleanup', label: 'Cleanup', icon: Brush },
      { id: 'recovery-center', label: 'Recovery', icon: LifeBuoy },
      { id: 'vault', label: 'Vault', icon: Archive },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { id: 'crash-intelligence', label: 'Crashes', icon: TriangleAlert },
      { id: 'device-dna', label: 'Baseline', icon: Boxes },
      { id: 'timeline', label: 'Timeline', icon: History },
    ],
  },
  {
    label: 'AI Assistant',
    items: [{ id: 'ai-detective', label: 'Copilot', icon: Bot }],
  },
];

interface SidebarProps {
  activeView: View;
  onNavigate: (view: View) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

function NavButton({
  item,
  active,
  onNavigate,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: (view: View) => void;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.id)}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={[
        'relative flex w-full items-center rounded-lg text-left text-[13px]',
        collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-2.5 py-2',
        'transition-colors duration-100 ease-ray',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        active
          ? 'bg-accent-subtle font-medium text-text-primary'
          : 'text-text-secondary hover:bg-sidebar-hover hover:text-text-primary',
      ].join(' ')}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent"
        />
      ) : null}
      <Icon
        aria-hidden
        className={[
          'h-[18px] w-[18px] flex-shrink-0',
          active ? 'text-accent' : 'text-text-muted',
        ].join(' ')}
        strokeWidth={1.75}
      />
      {!collapsed ? (
        <span className="min-w-0 truncate cause-medium">{item.label}</span>
      ) : null}
    </button>
  );
}

/**
 * Collapsible mock sidebar — navy surfaces, blue active rail, protected card.
 */
export function Sidebar({
  activeView,
  onNavigate,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  const { heartbeat, loadStatus } = useAgent();
  const {
    status: elevation,
    loading: elevating,
    refresh: refreshElevation,
    elevate,
  } = useElevation();

  useEffect(() => {
    void loadStatus();
    void refreshElevation();
    const id = window.setInterval(() => {
      void loadStatus();
      void refreshElevation();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [loadStatus, refreshElevation]);

  const elevated = elevation?.elevated === true;
  const live =
    heartbeat?.status === 'running' ||
    heartbeat?.status === 'idle' ||
    !!heartbeat;
  const modeLabel = elevated ? 'Admin' : 'Standard';
  const liveLabel = live ? 'Live' : 'Offline';

  return (
    <aside
      className={[
        'flex h-full flex-shrink-0 flex-col border-r border-sidebar-border bg-sidebar',
        'transition-[width] duration-200 ease-ray',
        collapsed ? 'w-[72px]' : 'w-[220px]',
      ].join(' ')}
    >
      {/* Brand + collapse */}
      <div
        className={[
          'flex h-14 items-center border-b border-sidebar-border',
          collapsed ? 'justify-center px-1' : 'gap-2 px-3',
        ].join(' ')}
      >
        {!collapsed ? (
          <>
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-subtle ring-1 ring-accent/30">
              <img
                src={iconAsset}
                alt=""
                aria-hidden
                className="h-5 w-5 object-contain"
              />
            </div>
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-text-primary cause-semibold">
              {APP_NAME}
            </span>
          </>
        ) : (
          <img
            src={iconAsset}
            alt=""
            aria-hidden
            className="h-7 w-7 object-contain"
          />
        )}
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className={[
            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
            'text-text-muted hover:bg-sidebar-hover hover:text-text-primary',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
            collapsed ? 'mt-0' : '',
          ].join(' ')}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
          )}
        </button>
      </div>

      <nav
        className={[
          'flex-1 space-y-4 overflow-y-auto pb-3 scrollbar-thin',
          collapsed ? 'px-1.5 pt-2' : 'px-2.5 pt-2',
        ].join(' ')}
        aria-label="Main navigation"
      >
        {NAV_SECTIONS.map((section, si) => (
          <div key={section.label ?? `top-${si}`}>
            {section.label && !collapsed ? (
              <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-ash cause-semibold">
                {section.label}
              </p>
            ) : section.label && collapsed ? (
              <div className="mx-auto mb-1 h-px w-6 bg-hairline" role="separator" />
            ) : null}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={item.id === activeView}
                  onNavigate={onNavigate}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* System protected card */}
      <div className="border-t border-sidebar-border p-2">
        {collapsed ? (
          <button
            type="button"
            onClick={() => onNavigate('security')}
            title={`System protected · ${liveLabel} · ${modeLabel}`}
            className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-status-success/30 bg-status-success-bg text-status-success focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <Shield className="h-4 w-4" strokeWidth={1.75} />
          </button>
        ) : (
          <div className="flex w-full items-center gap-2 rounded-xl border border-hairline bg-surface-card px-2.5 py-2">
            <button
              type="button"
              onClick={() => onNavigate('security')}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-status-success-bg text-status-success">
                <Shield className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-status-success cause-medium">
                  System protected
                </p>
                <p className="truncate text-2xs text-text-muted">
                  {liveLabel} · {modeLabel}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-muted" />
            </button>
            {!elevated ? (
              <button
                type="button"
                disabled={elevating}
                onClick={() => void elevate()}
                className="flex-shrink-0 rounded-md px-1.5 py-1 text-2xs font-medium text-accent hover:bg-accent-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                Elevate
              </button>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}
