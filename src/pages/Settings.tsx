import { useCallback, useEffect, useState } from 'react';
import {
  Info,
  Monitor,
  ScanSearch,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { StatusPill } from '../components/common/StatusPill';
import {
  SettingsRow,
  SettingsSection,
  ToggleSwitch,
} from '../components/settings/SettingsSection';
import { useAgent } from '../hooks/use-agent';
import { useElevation } from '../hooks/use-elevation';
import { useIntelligence } from '../hooks/use-intelligence';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type DensityPref,
  type StartPage,
  type UserPreferences,
} from '../lib/preferences';
import { APP_NAME, APP_TAGLINE, APP_VERSION } from '../lib/constants';
import { BlurFade } from '../components/motion/BlurFade';
import { PageShell } from '../components/layout/PageShell';

const START_PAGE_OPTIONS: { value: StartPage; label: string }[] = [
  { value: 'dashboard', label: 'Overview' },
  { value: 'health', label: 'Health' },
  { value: 'processes', label: 'Processes' },
  { value: 'storage', label: 'Storage' },
  { value: 'ai-detective', label: 'Copilot' },
];

const DENSITY_OPTIONS: { value: DensityPref; label: string }[] = [
  { value: 'compact', label: 'Compact (Raycast)' },
  { value: 'comfortable', label: 'Comfortable (Fluent)' },
];

/**
 * Settings surface — configuration without light/Mica experiments.
 */
export function Settings() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [savedFlash, setSavedFlash] = useState(false);

  const {
    copilotStatus,
    loadCopilotStatus,
    startLocalQwenInstall,
    installProgress,
  } = useIntelligence();
  const { heartbeat, loadStatus } = useAgent();
  const {
    status: elevation,
    loading: elevating,
    refresh: refreshElevation,
    elevate,
  } = useElevation();

  useEffect(() => {
    setPrefs(loadPreferences());
    void loadCopilotStatus();
    void loadStatus();
    void refreshElevation();
  }, [loadCopilotStatus, loadStatus, refreshElevation]);

  const commit = useCallback((next: UserPreferences) => {
    setPrefs(next);
    savePreferences(next);
    document.documentElement.dataset.density = next.density;
    document.documentElement.dataset.reduceMotion = next.reduceMotion
      ? 'true'
      : 'false';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-mica');
    document.documentElement.style.colorScheme = 'dark';
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
  }, []);

  const patch = (partial: Partial<UserPreferences>) => {
    commit({ ...prefs, ...partial });
  };

  const elevated = elevation?.elevated === true;
  const llmReady = copilotStatus?.llmConfigured === true;

  return (
    <PageShell
      title="Settings"
      description="Appearance, Copilot status, privileges, and about."
      actions={
        savedFlash ? <StatusPill tone="success">Saved</StatusPill> : undefined
      }
      wide={false}
    >
      <BlurFade delayMs={40}>
        <SettingsSection
          icon={SlidersHorizontal}
          title="Appearance & behavior"
          description="Density and behavior controls — changes apply immediately on this device."
        >
          <SettingsRow
            label="Start page"
            description="Which surface opens when you launch the app."
          >
            <select
              value={prefs.startPage}
              onChange={(e) =>
                patch({ startPage: e.target.value as StartPage })
              }
              className="h-9 min-w-[10rem] rounded-control border border-hairline bg-surface-elevated px-2.5 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
            >
              {START_PAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </SettingsRow>

          <SettingsRow
            label="Density"
            description="Compact keeps Raycast-style lists. Comfortable adds more breathing room."
          >
            <select
              value={prefs.density}
              onChange={(e) =>
                patch({ density: e.target.value as DensityPref })
              }
              className="h-9 min-w-[12rem] rounded-control border border-hairline bg-surface-elevated px-2.5 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
            >
              {DENSITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </SettingsRow>

          <SettingsRow
            label="Keyboard hints"
            description="Show keycaps (Ctrl+K, ↵) in the shell and command palette."
          >
            <ToggleSwitch
              label="Keyboard hints"
              checked={prefs.showKeyHints}
              onChange={(v) => patch({ showKeyHints: v })}
            />
          </SettingsRow>

          <SettingsRow
            label="Reduce motion"
            description="Disable blur-fade and number tickers even if Windows allows animations."
          >
            <ToggleSwitch
              label="Reduce motion"
              checked={prefs.reduceMotion}
              onChange={(v) => patch({ reduceMotion: v })}
            />
          </SettingsRow>

          <SettingsRow
            label="Confirm destructive actions"
            description="Ask before real installs, cleanup, or other irreversible steps."
          >
            <ToggleSwitch
              label="Confirm destructive actions"
              checked={prefs.confirmDestructive}
              onChange={(v) => patch({ confirmDestructive: v })}
            />
          </SettingsRow>
        </SettingsSection>
      </BlurFade>

      <BlurFade delayMs={70}>
        <SettingsSection
          icon={ScanSearch}
          title="Copilot & AI"
          description="On-device only: local Qwen3 when provisioned, otherwise offline heuristics. No cloud LLM APIs."
        >
          <SettingsRow
            label="Mode"
            description={
              llmReady
                ? 'Local Qwen3 is available for natural-language answers on this PC.'
                : 'Offline heuristic provider. Install local Qwen3 for richer answers.'
            }
          >
            <StatusPill tone={llmReady ? 'success' : 'neutral'}>
              {llmReady ? 'Local Qwen3' : 'Heuristic'}
            </StatusPill>
          </SettingsRow>

          <SettingsRow
            label="Active provider"
            description="Always local-qwen3 when the model is ready; otherwise heuristic."
          >
            <span className="font-mono text-sm text-text-secondary">
              {copilotStatus
                ? `${copilotStatus.provider} · ${copilotStatus.model}`
                : '…'}
            </span>
          </SettingsRow>

          <SettingsRow
            label="Local model"
            description={
              copilotStatus?.local?.modelInstalled
                ? copilotStatus.local.modelPath ?? 'Installed'
                : 'Missing Qwen3-0.6B-Q8_0.gguf'
            }
          >
            <span className="text-sm text-text-secondary">
              {copilotStatus?.local?.modelInstalled ? 'Installed' : 'Not found'}
            </span>
          </SettingsRow>

          <SettingsRow
            label="llama-server"
            description={
              copilotStatus?.local?.runtimeInstalled
                ? copilotStatus.local.runtimePath ?? 'Installed'
                : 'Missing llama-server.exe'
            }
          >
            <span className="text-sm text-text-secondary">
              {copilotStatus?.local?.runtimeInstalled
                ? 'Installed'
                : 'Not found'}
            </span>
          </SettingsRow>

          <SettingsRow
            label="Install on-device model"
            description={
              installProgress?.busy
                ? installProgress.message
                : copilotStatus?.local?.ready
                  ? 'Local Qwen3 is installed for this user.'
                  : 'Downloads ~640 MB privately to this PC (app data). No cloud APIs.'
            }
          >
            <Button
              variant="primary"
              size="sm"
              loading={installProgress?.busy === true}
              disabled={copilotStatus?.local?.ready === true}
              onClick={() => void startLocalQwenInstall()}
            >
              {copilotStatus?.local?.ready
                ? 'Installed'
                : installProgress?.busy
                  ? `${installProgress.percent}%`
                  : 'Download local model'}
            </Button>
          </SettingsRow>
        </SettingsSection>
      </BlurFade>

      <BlurFade delayMs={100}>
        <SettingsSection
          icon={ShieldCheck}
          title="Privileges & agent"
          description="Elevation unlocks deep process, driver, and service tools."
        >
          <SettingsRow
            label="Privilege level"
            description={
              elevated
                ? 'Running as Administrator — deep tools available.'
                : 'Standard user — elevate to unlock restricted collectors.'
            }
          >
            <div className="flex items-center gap-2">
              <StatusPill tone={elevated ? 'success' : 'warning'}>
                {elevated ? 'Administrator' : 'Standard'}
              </StatusPill>
              {!elevated && elevation ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={elevating}
                  onClick={() => void elevate()}
                >
                  Elevate
                </Button>
              ) : null}
            </div>
          </SettingsRow>

          <SettingsRow
            label="Local agent"
            description="Heartbeat from the UI process or background agent service."
          >
            <StatusPill tone={heartbeat ? 'success' : 'neutral'}>
              {heartbeat
                ? `${heartbeat.source.replace(/_/g, ' ')} · ${heartbeat.status}`
                : 'Not reporting'}
            </StatusPill>
          </SettingsRow>
        </SettingsSection>
      </BlurFade>

      <BlurFade delayMs={130}>
        <SettingsSection icon={Monitor} title="About" description={APP_TAGLINE}>
          <SettingsRow label="Application" description="Product name">
            <span className="text-sm text-text-secondary">{APP_NAME}</span>
          </SettingsRow>
          <SettingsRow
            label="Version"
            description="Matches package version for this build."
          >
            <span className="font-mono text-sm text-text-secondary">
              {APP_VERSION}
            </span>
          </SettingsRow>
          <SettingsRow
            label="Design system"
            description="Fluent Ops Shell × Raycast Command Layer (dark)"
          >
            <StatusPill tone="neutral">Dark · Raycast</StatusPill>
          </SettingsRow>
          <SettingsRow
            label="Reset preferences"
            description="Restore density, start page, and toggles to defaults."
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={() => commit({ ...DEFAULT_PREFERENCES })}
            >
              Reset to defaults
            </Button>
          </SettingsRow>
        </SettingsSection>
      </BlurFade>

      <p className="flex items-start gap-2 text-xs text-text-ash">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
        Preferences stay on this PC in local storage. API keys are never written
        by the Settings UI.
      </p>
    </PageShell>
  );
}
