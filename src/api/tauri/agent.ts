/**
 * Typed Tauri IPC wrappers for Agent status commands.
 *
 * These are the ONLY entry points for Tauri `invoke` calls related to
 * the always-on agent. Components and pages MUST NOT call `invoke` directly
 * (doc 48 AC-FS-04).
 *
 * Command names are snake_case (Tauri convention).
 */

import { invoke } from '@tauri-apps/api/core';
import type { AgentHeartbeat } from '../../types/device.types';

/** Latest agent heartbeat, or null if none recorded. */
export const getAgentStatus = (): Promise<AgentHeartbeat | null> =>
  invoke<AgentHeartbeat | null>('get_agent_status');

/** Record an in-process agent heartbeat (UI-hosted sampler). */
export const pingAgent = (): Promise<AgentHeartbeat> =>
  invoke<AgentHeartbeat>('ping_agent');
