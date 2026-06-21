import { formatBytes, formatPercent } from '../../lib/format';
import type { HealthAlert, HealthSample } from '../../types/device.types';

export interface HealthInsight {
  status: string;
  summary: string;
  primaryConcern: string;
  recommendedAction: string;
  evidence: string;
}

interface ResourcePressure {
  key: 'cpu' | 'memory' | 'disk';
  label: string;
  pct: number;
  severity: 'critical' | 'warning' | 'ok';
}

export function memoryPct(sample: HealthSample): number {
  return sample.memoryTotal > 0
    ? (sample.memoryUsed / sample.memoryTotal) * 100
    : 0;
}

export function diskPct(sample: HealthSample): number {
  return sample.diskTotal > 0 ? (sample.diskUsed / sample.diskTotal) * 100 : 0;
}

function pressureFor(
  key: ResourcePressure['key'],
  label: string,
  pct: number,
): ResourcePressure {
  const severity = pct >= 85 ? 'critical' : pct >= 75 ? 'warning' : 'ok';
  return { key, label, pct, severity };
}

function sortPressure(a: ResourcePressure, b: ResourcePressure): number {
  const rank = { critical: 0, warning: 1, ok: 2 };
  return rank[a.severity] - rank[b.severity] || b.pct - a.pct;
}

function statusFor(score: number): string {
  if (score >= 80) {
    return 'Healthy';
  }
  if (score >= 50) {
    return 'Needs attention';
  }
  return 'At risk';
}

function actionFor(resource: ResourcePressure | undefined): string {
  if (!resource || resource.severity === 'ok') {
    return 'Keep sampling over time. The next useful signal is whether this pattern repeats while you are doing normal work.';
  }

  if (resource.key === 'disk') {
    return 'Free disk space first. Remove large downloads, installers, caches, or old exports, then sample again to confirm the score improves.';
  }

  if (resource.key === 'memory') {
    return 'Close memory-heavy apps, reduce startup apps, or restart the device. If memory stays high after a restart, check what launches automatically.';
  }

  return 'Find the app using CPU in Task Manager. If CPU stays high while idle, check recent installs, browser tabs, background sync, or security scans.';
}

function concernFor(resource: ResourcePressure | undefined): string {
  if (!resource || resource.severity === 'ok') {
    return 'No single resource is currently saturated.';
  }
  return `${resource.label} is the main pressure point at ${formatPercent(resource.pct)}.`;
}

function diskLabel(sample: HealthSample): string {
  return sample.diskCount > 1 ? 'Most constrained disk' : 'Disk';
}

function diskEvidence(sample: HealthSample): string {
  const usage = `${formatBytes(sample.diskUsed)} of ${formatBytes(sample.diskTotal)}`;
  const diskName = sample.diskName?.trim();

  if (diskName && sample.diskCount > 1) {
    return `Most constrained disk ${diskName}: ${usage} after checking ${sample.diskCount} disks.`;
  }

  if (diskName) {
    return `Disk ${diskName}: ${usage}.`;
  }

  if (sample.diskCount > 1) {
    return `Most constrained disk: ${usage} after checking ${sample.diskCount} disks.`;
  }

  return `Disk: ${usage}.`;
}

export function buildHealthInsight(
  sample: HealthSample,
  alerts: HealthAlert[],
): HealthInsight {
  const pressure = [
    pressureFor('cpu', 'CPU', sample.cpuUsage),
    pressureFor('memory', 'Memory', memoryPct(sample)),
    pressureFor('disk', diskLabel(sample), diskPct(sample)),
  ].sort(sortPressure);
  const top = pressure[0];
  const activeAlerts = alerts.filter((alert) => !alert.acknowledged);
  const saturated = pressure.filter((item) => item.severity !== 'ok');
  const status = statusFor(sample.healthScore);

  const summary =
    saturated.length > 0
      ? `${status}: ${saturated
          .map((item) => `${item.label.toLowerCase()} is ${formatPercent(item.pct)}`)
          .join(', ')}.`
      : `${status}: current CPU, memory, and disk pressure are all within normal range.`;

  const alertText =
    activeAlerts.length > 0
      ? `${activeAlerts.length} active alert${
          activeAlerts.length === 1 ? '' : 's'
        } need review.`
      : 'No active health alerts are waiting.';

  return {
    status,
    summary,
    primaryConcern: concernFor(top),
    recommendedAction: actionFor(top),
    evidence: `${alertText} Memory: ${formatBytes(sample.memoryUsed)} of ${formatBytes(
      sample.memoryTotal,
    )}. ${diskEvidence(sample)}`,
  };
}
