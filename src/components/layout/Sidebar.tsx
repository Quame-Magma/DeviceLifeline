import { useEffect } from 'react';
import {
  Archive,
  Boxes,
  ChartLine,
  Cpu,
  FolderSearch,
  FileSpreadsheet,
  Gauge,
  HardDrive,
  History,
  LayoutGrid,
  Package,
  Power,
  ScanSearch,
  ShieldCheck,
  Sparkles,
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

/**
 * Primary destinations — concrete ops icons (not generic “AI” metaphors).
 */
const PRIMARY_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Overview', icon: LayoutGrid },
  { id: 'health', label: 'Health', icon: Gauge },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'processes', label: 'Processes', icon: ChartLine },
  { id: 'ai-detective', label: 'Copilot', icon: ScanSearch },
];

const SECONDARY_NAV: NavItem[] = [
  { id: 'hardware', label: 'Hardware', icon: Cpu },
  { id: 'drivers', label: 'Drivers', icon: Wrench },
  { id: 'startup', label: 'Startup', icon: Power },
  { id: 'cleanup', label: 'Cleanup', icon: Sparkles },
  { id: 'system-report', label: 'Report', icon: FileSpreadsheet },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'crash-intelligence', label: 'Crashes', icon: TriangleAlert },
  { id: 'device-dna', label: 'Baseline', icon: Boxes },
  { id: 'software', label: 'Software', icon: Package },
  { id: 'timeline', label: 'Timeline', icon: History },
  { id: 'recovery-center', label: 'Recovery', icon: Archive },
  { id: 'vault', label: 'Vault', icon: Archive },
  { id: 'search', label: 'Search', icon: FolderSearch },
];

interface SidebarProps {
  activeView: View;
  onNavigate: (view: View) => void;
}

function NavButton({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: (view: View) => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.id)}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left text-[13px]',
        'transition-colors duration-100 ease-ray',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25',
        active
          ? 'bg-surface-card font-medium text-text-primary'
          : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
      ].join(' ')}
    >
      <Icon
        aria-hidden
        className={[
          'h-5 w-5 flex-shrink-0',
          active ? 'text-text-primary' : 'text-text-muted',
        ].join(' ')}
        strokeWidth={1.75}
      />
      <span className="min-w-0 truncate">{item.label}</span>
    </button>
  );
}

/**
 * Minimal rail — larger icons, concrete glyphs, settings via top gear only.
 */
export function Sidebar({ activeView, onNavigate }: SidebarProps) {
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
  const statusBits: string[] = [];
  if (heartbeat) {
    statusBits.push(heartbeat.status === 'running' ? 'Live' : heartbeat.status);
  }
  statusBits.push(elevated ? 'Admin' : 'Standard');

  return (
    <aside className="flex h-full w-[212px] flex-shrink-0 flex-col border-r border-hairline bg-canvas">
      <div className="flex h-12 items-center gap-2.5 px-3">
        <img
          src={iconAsset}
          alt=""
          aria-hidden
          className="h-7 w-7 flex-shrink-0 object-contain"
        />
        <span className="truncate text-sm font-semibold tracking-tight text-text-primary">
          {APP_NAME}
        </span>
      </div>

      <nav
        className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2 scrollbar-thin"
        aria-label="Main navigation"
      >
        {PRIMARY_NAV.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={item.id === activeView}
            onNavigate={onNavigate}
          />
        ))}

        <div className="my-2 border-t border-hairline" role="separator" />

        {SECONDARY_NAV.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={item.id === activeView}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="border-t border-hairline px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p
            className="min-w-0 truncate text-2xs text-text-muted"
            title={heartbeat?.detail ?? statusBits.join(' · ')}
          >
            {statusBits.join(' · ')}
          </p>
          {!elevated && elevation ? (
            <button
              type="button"
              disabled={elevating}
              onClick={() => void elevate()}
              className="flex-shrink-0 text-2xs font-medium text-text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
            >
              Elevate
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
