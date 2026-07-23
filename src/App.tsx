import { useEffect, useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import type { View } from './components/layout/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { DeviceDNA } from './pages/DeviceDNA';
import { Timeline } from './pages/Timeline';
import { RecoveryCenter } from './pages/RecoveryCenter';
import { Health } from './pages/Health';
import { CrashIntelligence } from './pages/CrashIntelligence';
import { AIDetective } from './pages/AIDetective';
import { ProcessExplorer } from './pages/ProcessExplorer';
import { StorageCenter } from './pages/StorageCenter';
import { UniversalSearch } from './pages/UniversalSearch';
import { SoftwareLifecycle } from './pages/SoftwareLifecycle';
import { HardwareCenter } from './pages/HardwareCenter';
import { DriverCenter } from './pages/DriverCenter';
import { StartupCenter } from './pages/StartupCenter';
import { CleanupCenter } from './pages/CleanupCenter';
import { SystemReport } from './pages/SystemReport';
import { SecurityCenter } from './pages/SecurityCenter';
import { RecoveryVault } from './pages/RecoveryVault';
import { Settings } from './pages/Settings';
import { loadPreferences, type StartPage } from './lib/preferences';

function resolveStartView(): View {
  const start = loadPreferences().startPage;
  const allowed: StartPage[] = [
    'dashboard',
    'health',
    'processes',
    'storage',
    'ai-detective',
  ];
  return allowed.includes(start) ? start : 'dashboard';
}

/**
 * Root application component.
 * Manages the active view via lightweight local state (no router required for
 * this single-slice increment). Navigation is handled by the AppShell sidebar
 * and command palette.
 */
export default function App() {
  const [activeView, setActiveView] = useState<View>('dashboard');

  useEffect(() => {
    setActiveView(resolveStartView());
  }, []);

  return (
    <AppShell activeView={activeView} onNavigate={setActiveView}>
      {activeView === 'dashboard' && <Dashboard onNavigate={setActiveView} />}
      {activeView === 'device-dna' && <DeviceDNA />}
      {activeView === 'timeline' && <Timeline />}
      {activeView === 'recovery-center' && <RecoveryCenter />}
      {activeView === 'health' && <Health onNavigate={setActiveView} />}
      {activeView === 'crash-intelligence' && <CrashIntelligence />}
      {activeView === 'ai-detective' && (
        <AIDetective onNavigate={setActiveView} />
      )}
      {activeView === 'processes' && <ProcessExplorer />}
      {activeView === 'storage' && <StorageCenter />}
      {activeView === 'search' && <UniversalSearch />}
      {activeView === 'software' && <SoftwareLifecycle />}
      {activeView === 'hardware' && <HardwareCenter />}
      {activeView === 'drivers' && <DriverCenter />}
      {activeView === 'startup' && <StartupCenter />}
      {activeView === 'cleanup' && <CleanupCenter />}
      {activeView === 'system-report' && <SystemReport />}
      {activeView === 'security' && <SecurityCenter />}
      {activeView === 'vault' && <RecoveryVault />}
      {activeView === 'settings' && <Settings />}
    </AppShell>
  );
}
