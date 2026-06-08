import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import type { View } from './Sidebar';

interface AppShellProps {
  activeView: View;
  onNavigate: (view: View) => void;
  children: ReactNode;
}

/**
 * Root application shell: dark sidebar + scrollable main content area.
 * The shell occupies the full viewport and does not scroll itself.
 */
export function AppShell({ activeView, onNavigate, children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar activeView={activeView} onNavigate={onNavigate} />
      <main
        id="main-content"
        className="flex flex-1 flex-col overflow-y-auto scrollbar-thin"
        role="main"
      >
        {children}
      </main>
    </div>
  );
}
