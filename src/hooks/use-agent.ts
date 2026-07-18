/**
 * `useAgent` - custom hook for Agent status API calls.
 *
 * Components and pages MUST use this hook to interact with agent heartbeats.
 * They must NOT import from `src/api/tauri/agent.ts` directly.
 */

import { useCallback, useState } from 'react';
import {
  getAgentStatus,
  pingAgent as apiPingAgent,
} from '../api/tauri/agent';
import type { AgentHeartbeat } from '../types/device.types';

function toMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return fallback;
}

export interface UseAgentReturn {
  heartbeat: AgentHeartbeat | null;
  loading: boolean;
  error: string | null;
  loadStatus: () => Promise<void>;
  ping: () => Promise<void>;
}

export function useAgent(): UseAgentReturn {
  const [heartbeat, setHeartbeat] = useState<AgentHeartbeat | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await getAgentStatus();
      setHeartbeat(status);
    } catch (err) {
      // Graceful: agent may be unavailable; surface quietly.
      setError(toMessage(err, 'Failed to load agent status.'));
      setHeartbeat(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const ping = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const beat = await apiPingAgent();
      setHeartbeat(beat);
    } catch (err) {
      setError(toMessage(err, 'Failed to ping agent.'));
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    heartbeat,
    loading,
    error,
    loadStatus,
    ping,
  };
}
