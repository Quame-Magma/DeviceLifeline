import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Bell, ChevronDown, Search, Settings } from 'lucide-react';
import { Sidebar } from './Sidebar';
import type { View } from './Sidebar';
import {
  CommandPalette,
  useCommandPaletteShortcut,
} from './CommandPalette';
import { Keycap } from '../common/Keycap';
import {
  loadPreferences,
  PREFERENCES_CHANGED_EVENT,
  type UserPreferences,
} from '../../lib/preferences';

interface AppShellProps {
  activeView: View;
  onNavigate: (view: View) => void;
  children: ReactNode;
}

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
}

/**
 * Fluent Ops Shell (Windows 11 structure) + Raycast command layer.
 *
 * W11 owns: nav rail, content canvas layering, page chrome, settings IA.
 * Raycast owns: palette, keycaps, white CTAs, dense command rows.
 * Acrylic only on the palette (transient); shell stays solid.
 */
const SIDEBAR_COLLAPSED_KEY = 'devicelifeline.sidebar.collapsed';

export function AppShell({ activeView, onNavigate, children }: AppShellProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showKeyHints, setShowKeyHints] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const apply = (prefs: UserPreferences) => {
      setShowKeyHints(prefs.showKeyHints);
      document.documentElement.dataset.density = prefs.density;
      document.documentElement.dataset.reduceMotion = prefs.reduceMotion
        ? 'true'
        : 'false';
      // Force dark shell — clear any leftover light/mica attrs from prior builds
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.removeAttribute('data-mica');
      document.documentElement.style.colorScheme = 'dark';
    };

    apply(loadPreferences());

    const onLocal = (event: Event) => {
      const detail = (event as CustomEvent<UserPreferences>).detail;
      apply(detail ?? loadPreferences());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'devicelifeline.preferences.v1') {
        apply(loadPreferences());
      }
    };

    window.addEventListener(PREFERENCES_CHANGED_EVENT, onLocal);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PREFERENCES_CHANGED_EVENT, onLocal);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const togglePalette = useCallback(() => {
    setPaletteOpen((open) => !open);
  }, []);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
  }, []);

  useCommandPaletteShortcut(togglePalette);

  const modKey = isMacPlatform() ? '⌘' : 'Ctrl';

  function avatarInitial(): string {
    try {
      const n = localStorage.getItem('devicelifeline.displayName')?.trim();
      if (n) return n.charAt(0).toUpperCase();
    } catch {
      /* ignore */
    }
    return 'A';
  }

  return (
    <div className="app-backdrop flex h-screen overflow-hidden bg-canvas">
      <Sidebar
        activeView={activeView}
        onNavigate={onNavigate}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-hairline bg-canvas px-3 sm:px-5">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            data-testid="command-palette-trigger"
            className={[
              'group flex min-w-0 max-w-md flex-1 items-center gap-2.5 rounded-xl',
              'border border-hairline bg-surface-elevated px-3.5 py-2 text-left text-sm text-text-muted',
              'transition-colors duration-150 ease-ray',
              'hover:border-hairline-strong hover:bg-surface-card hover:text-text-secondary',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25',
            ].join(' ')}
          >
            <Search
              aria-hidden="true"
              className="h-4 w-4 flex-shrink-0 text-text-muted transition-colors group-hover:text-text-secondary"
              strokeWidth={1.75}
            />
            <span className="min-w-0 flex-1 truncate">
              Search tools, findings, files…
            </span>
            {showKeyHints ? (
              <span className="hidden items-center gap-1 sm:inline-flex">
                <Keycap>{modKey}</Keycap>
                <Keycap>K</Keycap>
              </span>
            ) : null}
          </button>

          <div className="ml-auto flex flex-shrink-0 items-center gap-1">
            <button
              type="button"
              title="Notifications"
              aria-label="Notifications"
              className={[
                'flex h-9 w-9 items-center justify-center rounded-lg',
                'text-text-muted hover:bg-surface-elevated hover:text-text-primary',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25',
              ].join(' ')}
            >
              <Bell className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              title="Settings"
              aria-label="Open settings"
              data-testid="settings-trigger"
              className={[
                'flex h-9 w-9 items-center justify-center rounded-lg',
                'text-text-muted hover:bg-surface-elevated hover:text-text-primary',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25',
                activeView === 'settings'
                  ? 'bg-surface-card text-text-primary'
                  : '',
              ].join(' ')}
            >
              <Settings className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              title="Account"
              aria-label="Account menu"
              className={[
                'ml-0.5 flex h-9 items-center gap-1 rounded-full border border-hairline',
                'bg-surface-elevated pl-0.5 pr-1.5 text-text-secondary',
                'hover:border-hairline-strong hover:text-text-primary',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25',
              ].join(' ')}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-subtle text-xs font-semibold text-accent">
                {avatarInitial()}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-text-muted" aria-hidden />
            </button>
          </div>
        </header>

        <main
          id="main-content"
          className="content-canvas flex flex-1 flex-col overflow-y-auto scrollbar-thin"
          role="main"
        >
          {children}
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={closePalette}
        onNavigate={onNavigate}
      />
    </div>
  );
}
