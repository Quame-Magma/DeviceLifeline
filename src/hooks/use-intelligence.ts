/**
 * `useIntelligence` - custom hook for Intelligence Spine API calls.
 *
 * Components and pages MUST use this hook to interact with intelligence data.
 * They must NOT import from `src/api/tauri/intelligence.ts` directly.
 */

import { useCallback, useState } from 'react';
import {
  dismissFinding as apiDismissFinding,
  executeSafeCleanup as apiExecuteSafeCleanup,
  getCopilotStatus as apiGetCopilotStatus,
  getDashboardIntelligence,
  getLocalQwenInstallProgress as apiGetInstallProgress,
  listActionAudit,
  listIntelligenceFindings,
  proposeSafeCleanup as apiProposeSafeCleanup,
  startLocalQwenInstall as apiStartLocalQwenInstall,
} from '../api/tauri/intelligence';
import type {
  ActionAuditEntry,
  CleanupResult,
  CopilotStatus,
  DashboardIntelligence,
  IntelligenceFinding,
  LocalQwenInstallProgress,
} from '../types/device.types';

function toMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return fallback;
}

export interface UseIntelligenceReturn {
  dashboard: DashboardIntelligence | null;
  findings: IntelligenceFinding[];
  audit: ActionAuditEntry[];
  cleanupPreview: ActionAuditEntry | null;
  cleanupResult: CleanupResult | null;
  copilotStatus: CopilotStatus | null;
  loading: boolean;
  dismissing: boolean;
  cleanupLoading: boolean;
  error: string | null;
  loadDashboard: () => Promise<void>;
  loadFindings: (includeDismissed?: boolean) => Promise<void>;
  loadAudit: () => Promise<void>;
  dismiss: (findingId: string) => Promise<void>;
  previewCleanup: () => Promise<void>;
  executeCleanup: (confirm: boolean) => Promise<void>;
  loadCopilotStatus: () => Promise<void>;
  /** Start downloading local Qwen3 into app data (~640 MB). */
  startLocalQwenInstall: () => Promise<void>;
  installProgress: LocalQwenInstallProgress | null;
  refreshInstallProgress: () => Promise<void>;
}

export function useIntelligence(): UseIntelligenceReturn {
  const [dashboard, setDashboard] = useState<DashboardIntelligence | null>(
    null,
  );
  const [findings, setFindings] = useState<IntelligenceFinding[]>([]);
  const [audit, setAudit] = useState<ActionAuditEntry[]>([]);
  const [cleanupPreview, setCleanupPreview] =
    useState<ActionAuditEntry | null>(null);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(
    null,
  );
  const [copilotStatus, setCopilotStatus] = useState<CopilotStatus | null>(
    null,
  );
  const [installProgress, setInstallProgress] =
    useState<LocalQwenInstallProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDashboardIntelligence();
      setDashboard(data);
      setFindings(data.recentFindings ?? []);
    } catch (err) {
      setError(toMessage(err, 'Failed to load dashboard intelligence.'));
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFindings = useCallback(async (includeDismissed = false) => {
    setLoading(true);
    setError(null);
    try {
      const list = await listIntelligenceFindings(includeDismissed);
      setFindings(list);
    } catch (err) {
      setError(toMessage(err, 'Failed to load intelligence findings.'));
      setFindings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listActionAudit();
      setAudit(list);
    } catch (err) {
      setError(toMessage(err, 'Failed to load action audit.'));
      setAudit([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const dismiss = useCallback(async (findingId: string) => {
    setDismissing(true);
    setError(null);
    try {
      await apiDismissFinding(findingId);
      setFindings((prev) => prev.filter((f) => f.id !== findingId));
      setDashboard((prev) =>
        prev
          ? {
              ...prev,
              recentFindings: prev.recentFindings.filter(
                (f) => f.id !== findingId,
              ),
              openFindings: Math.max(0, prev.openFindings - 1),
            }
          : prev,
      );
    } catch (err) {
      setError(toMessage(err, 'Failed to dismiss finding.'));
    } finally {
      setDismissing(false);
    }
  }, []);

  const previewCleanup = useCallback(async () => {
    setCleanupLoading(true);
    setError(null);
    setCleanupResult(null);
    try {
      const entry = await apiProposeSafeCleanup();
      setCleanupPreview(entry);
    } catch (err) {
      setError(toMessage(err, 'Failed to preview cleanup.'));
    } finally {
      setCleanupLoading(false);
    }
  }, []);

  const executeCleanup = useCallback(async (confirm: boolean) => {
    setCleanupLoading(true);
    setError(null);
    try {
      const result = await apiExecuteSafeCleanup(confirm);
      setCleanupResult(result);
      setCleanupPreview(result.action);
    } catch (err) {
      setError(toMessage(err, 'Failed to execute cleanup.'));
    } finally {
      setCleanupLoading(false);
    }
  }, []);

  const loadCopilotStatus = useCallback(async () => {
    try {
      const status = await apiGetCopilotStatus();
      setCopilotStatus(status);
      if (status.local) {
        setInstallProgress({
          phase: status.local.installPhase ?? 'idle',
          percent: status.local.installPercent ?? 0,
          message: status.local.installMessage ?? '',
          error: status.local.installError ?? null,
          busy: status.local.installBusy ?? false,
        });
      }
    } catch {
      // Graceful fallback when the backend is unavailable.
      setCopilotStatus({
        llmConfigured: false,
        provider: 'heuristic',
        model: 'offline',
        availableProviders: [],
        local: {
          provider: 'local-qwen3',
          model: 'Qwen3-0.6B',
          endpoint: 'http://127.0.0.1:39201/v1',
          modelPath: null,
          runtimePath: null,
          modelInstalled: false,
          runtimeInstalled: false,
          ready: false,
          modelDownloadUrl: '',
          runtimeDownloadUrl: '',
        },
      });
    }
  }, []);

  const refreshInstallProgress = useCallback(async () => {
    try {
      const p = await apiGetInstallProgress();
      setInstallProgress(p);
    } catch {
      /* ignore */
    }
  }, []);

  const startLocalQwenInstall = useCallback(async () => {
    setError(null);
    try {
      const p = await apiStartLocalQwenInstall();
      setInstallProgress(p);
    } catch (err) {
      setError(toMessage(err, 'Failed to start local model install.'));
    }
  }, []);

  return {
    dashboard,
    findings,
    audit,
    cleanupPreview,
    cleanupResult,
    copilotStatus,
    installProgress,
    loading,
    dismissing,
    cleanupLoading,
    error,
    loadDashboard,
    loadFindings,
    loadAudit,
    dismiss,
    previewCleanup,
    executeCleanup,
    loadCopilotStatus,
    startLocalQwenInstall,
    refreshInstallProgress,
  };
}
