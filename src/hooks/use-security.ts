/**
 * `useSecurity` - custom hook for Behavioral Security API calls.
 *
 * Components and pages MUST use this hook to interact with security findings.
 * They must NOT import from `src/api/tauri/security.ts` directly.
 */

import { useCallback, useState } from 'react';
import {
  dismissSecurityFinding as apiDismiss,
  listSecurityFindings,
  scanSecurity as apiScanSecurity,
} from '../api/tauri/security';
import type { SecurityFinding } from '../types/device.types';

function toMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return fallback;
}

export interface UseSecurityReturn {
  findings: SecurityFinding[];
  loading: boolean;
  scanning: boolean;
  dismissing: boolean;
  error: string | null;
  loadFindings: (includeDismissed?: boolean) => Promise<void>;
  scan: () => Promise<void>;
  dismiss: (findingId: string) => Promise<void>;
}

export function useSecurity(): UseSecurityReturn {
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFindings = useCallback(async (includeDismissed = false) => {
    setLoading(true);
    setError(null);
    try {
      const list = await listSecurityFindings(includeDismissed);
      setFindings(list);
    } catch (err) {
      setError(toMessage(err, 'Failed to load security findings.'));
      setFindings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const scan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const list = await apiScanSecurity();
      setFindings(list);
    } catch (err) {
      setError(toMessage(err, 'Failed to scan security.'));
    } finally {
      setScanning(false);
    }
  }, []);

  const dismiss = useCallback(async (findingId: string) => {
    setDismissing(true);
    setError(null);
    try {
      await apiDismiss(findingId);
      setFindings((prev) => prev.filter((f) => f.id !== findingId));
    } catch (err) {
      setError(toMessage(err, 'Failed to dismiss security finding.'));
    } finally {
      setDismissing(false);
    }
  }, []);

  return {
    findings,
    loading,
    scanning,
    dismissing,
    error,
    loadFindings,
    scan,
    dismiss,
  };
}
