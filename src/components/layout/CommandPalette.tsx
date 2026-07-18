import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  Archive,
  Boxes,
  ChartLine,
  Cpu,
  FolderSearch,
  Gauge,
  HardDrive,
  History,
  LayoutGrid,
  FileSpreadsheet,
  Package,
  Power,
  ScanSearch,
  Settings,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { View } from './Sidebar';
import { Keycap } from '../common/Keycap';

export interface CommandItem {
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
  keywords?: string;
  view?: View;
  action?: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: View) => void;
  extraItems?: CommandItem[];
}

const NAV_COMMANDS: CommandItem[] = [
  {
    id: 'nav-dashboard',
    label: 'Overview',
    group: 'Primary',
    icon: LayoutGrid,
    keywords: 'dashboard home status',
    view: 'dashboard',
  },
  {
    id: 'nav-health',
    label: 'Health',
    group: 'Primary',
    icon: Gauge,
    keywords: 'cpu memory disk score',
    view: 'health',
  },
  {
    id: 'nav-storage',
    label: 'Storage',
    group: 'Primary',
    icon: HardDrive,
    keywords: 'disk files cleanup large map',
    view: 'storage',
  },
  {
    id: 'nav-processes',
    label: 'Processes',
    group: 'Primary',
    icon: ChartLine,
    keywords: 'cpu memory process risk tree',
    view: 'processes',
  },
  {
    id: 'nav-copilot',
    label: 'Copilot',
    group: 'Primary',
    icon: ScanSearch,
    keywords: 'diagnosis ai detective ask',
    view: 'ai-detective',
  },
  {
    id: 'nav-hardware',
    label: 'Hardware',
    group: 'Tools',
    icon: Cpu,
    keywords: 'cpu gpu temp smart sensors hwinfo fan',
    view: 'hardware',
  },
  {
    id: 'nav-drivers',
    label: 'Drivers',
    group: 'Tools',
    icon: Wrench,
    keywords: 'driver signed pnp health ddu gpu clean',
    view: 'drivers',
  },
  {
    id: 'nav-startup',
    label: 'Startup',
    group: 'Tools',
    icon: Power,
    keywords: 'autoruns run key service task startup',
    view: 'startup',
  },
  {
    id: 'nav-cleanup',
    label: 'Cleanup',
    group: 'Tools',
    icon: Sparkles,
    keywords: 'ccleaner glary temp cache clean recycle',
    view: 'cleanup',
  },
  {
    id: 'nav-report',
    label: 'System report',
    group: 'Tools',
    icon: FileSpreadsheet,
    keywords: 'aida64 inventory benchmark report export',
    view: 'system-report',
  },
  {
    id: 'nav-security',
    label: 'Security',
    group: 'Tools',
    icon: ShieldCheck,
    keywords: 'security finding threat persistence',
    view: 'security',
  },
  {
    id: 'nav-crash',
    label: 'Crashes',
    group: 'Tools',
    icon: TriangleAlert,
    keywords: 'bsod hang stability',
    view: 'crash-intelligence',
  },
  {
    id: 'nav-device-dna',
    label: 'Baseline',
    group: 'Tools',
    icon: Boxes,
    keywords: 'dna snapshot baseline inventory',
    view: 'device-dna',
  },
  {
    id: 'nav-timeline',
    label: 'Timeline',
    group: 'Tools',
    icon: History,
    keywords: 'changes history events',
    view: 'timeline',
  },
  {
    id: 'nav-software',
    label: 'Software',
    group: 'Tools',
    icon: Package,
    keywords: 'apps updates install uninstall revo leftovers',
    view: 'software',
  },
  {
    id: 'nav-recovery',
    label: 'Recovery',
    group: 'Tools',
    icon: Archive,
    keywords: 'restore plan dry run',
    view: 'recovery-center',
  },
  {
    id: 'nav-vault',
    label: 'Vault',
    group: 'Tools',
    icon: Archive,
    keywords: 'vault restore point dna backup image',
    view: 'vault',
  },
  {
    id: 'nav-search',
    label: 'Search',
    group: 'Tools',
    icon: FolderSearch,
    keywords: 'find query index file',
    view: 'search',
  },
  {
    id: 'nav-settings',
    label: 'Settings',
    group: 'System',
    icon: Settings,
    keywords: 'preferences config llm elevate agent about density',
    view: 'settings',
  },
];

function matchesQuery(item: CommandItem, query: string): boolean {
  if (!query) return true;
  const haystack = `${item.label} ${item.group} ${item.keywords ?? ''}`.toLowerCase();
  return haystack.includes(query);
}

export function CommandPalette({
  open,
  onClose,
  onNavigate,
  extraItems = [],
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const items = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...NAV_COMMANDS, ...extraItems].filter((item) =>
      matchesQuery(item, normalized),
    );
  }, [extraItems, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, { item: CommandItem; index: number }[]>();
    items.forEach((item, index) => {
      const list = map.get(item.group) ?? [];
      list.push({ item, index });
      map.set(item.group, list);
    });
    return map;
  }, [items]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-command-index="${activeIndex}"]`,
    );
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, open]);

  const runItem = useCallback(
    (item: CommandItem) => {
      if (item.view) onNavigate(item.view);
      item.action?.();
      onClose();
    },
    [onClose, onNavigate],
  );

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (items.length === 0 ? 0 : (i + 1) % items.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) =>
        items.length === 0 ? 0 : (i - 1 + items.length) % items.length,
      );
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) runItem(item);
    }
  };

  if (!open) return null;

  return (
    <div
      className="smoke-overlay fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh] animate-fade-in"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        data-testid="command-palette"
        className="acrylic-panel w-full max-w-lg overflow-hidden rounded-overlay animate-scale-in"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2.5 border-b border-hairline px-3">
          <FolderSearch
            aria-hidden
            className="h-4 w-4 flex-shrink-0 text-text-muted"
            strokeWidth={1.75}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Jump to a tool or action…"
            aria-label="Command search"
            data-testid="command-palette-input"
            className="w-full bg-transparent py-3.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <Keycap className="hidden sm:inline-flex">Esc</Keycap>
        </div>

        <ul
          ref={listRef}
          role="listbox"
          aria-label="Commands"
          className="max-h-80 overflow-y-auto py-1.5 scrollbar-thin"
        >
          {items.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-text-secondary">
              No matching commands
            </li>
          ) : (
            Array.from(grouped.entries()).map(([group, rows]) => (
              <li key={group} role="presentation">
                <p className="px-3 pb-1 pt-2 text-2xs font-medium text-text-ash">
                  {group}
                </p>
                <ul role="group" aria-label={group}>
                  {rows.map(({ item, index }) => {
                    const Icon = item.icon;
                    const isActive = index === activeIndex;
                    return (
                      <li key={item.id} role="option" aria-selected={isActive}>
                        <button
                          type="button"
                          data-command-index={index}
                          data-testid={`command-item-${item.id}`}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => runItem(item)}
                          className={[
                            'mx-1.5 flex w-[calc(100%-0.75rem)] items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-sm transition-colors duration-100',
                            isActive
                              ? 'bg-surface-card text-text-primary'
                              : 'text-text-primary hover:bg-surface-card/60',
                          ].join(' ')}
                        >
                          <Icon
                            aria-hidden
                            className={[
                              'h-4 w-4 flex-shrink-0',
                              isActive ? 'text-text-primary' : 'text-text-muted',
                            ].join(' ')}
                            strokeWidth={1.75}
                          />
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {item.label}
                          </span>
                          {isActive ? (
                            <Keycap className="hidden sm:inline-flex">↵</Keycap>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

export function useCommandPaletteShortcut(
  onToggle: () => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => {
      const isMod = event.metaKey || event.ctrlKey;
      if (isMod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onToggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onToggle]);
}
