import { useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import type { View } from './components/layout/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { DeviceDNA } from './pages/DeviceDNA';
import { Timeline } from './pages/Timeline';
import { RecoveryCenter } from './pages/RecoveryCenter';
import { Health } from './pages/Health';
import { CrashIntelligence } from './pages/CrashIntelligence';

/**
 * Root application component.
 * Manages the active view via lightweight local state (no router required for
 * this single-slice increment). Navigation is handled by the AppShell sidebar.
 */
export default function App() {
  const [activeView, setActiveView] = useState<View>('dashboard');

  return (
    <AppShell activeView={activeView} onNavigate={setActiveView}>
      {activeView === 'dashboard' && <Dashboard />}
      {activeView === 'device-dna' && <DeviceDNA />}
      {activeView === 'timeline' && <Timeline />}
      {activeView === 'recovery-center' && <RecoveryCenter />}
      {activeView === 'health' && <Health />}
      {activeView === 'crash-intelligence' && <CrashIntelligence />}
    </AppShell>
  );
}
