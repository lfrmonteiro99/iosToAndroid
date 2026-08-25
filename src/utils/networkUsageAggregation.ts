/**
 * Pure formatting/sorting helpers for the native network-usage-per-app feature
 * (#624-S4, child of #624). The native side (`TrafficMonitorService` +
 * `LauncherModule.getNetworkUsageByApp`) already returns per-app DELTAS — not
 * cumulative TrafficStats counters — so there is no delta math to redo here.
 * This module only turns that list into what the UI renders: framework-free
 * and out of the bridge, mirroring src/utils/appAccessAggregation.ts (#634).
 */

export interface NetworkUsageApp {
  packageName: string;
  appName: string;
  txBytes: number;
  rxBytes: number;
}

/** Total bytes (sent + received) attributed to one app. */
export function totalNetworkBytes(app: NetworkUsageApp): number {
  return app.txBytes + app.rxBytes;
}

/**
 * Human-readable "X.X MB" label. A non-zero value under 0.1 MB is shown as
 * "< 0.1 MB" rather than rounding to "0.0 MB", so a small-but-real transfer
 * doesn't read as no usage at all. Negative or non-finite input (a malformed
 * bridge payload) is treated as zero, never as a negative label.
 */
export function formatNetworkBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) return '< 0.1 MB';
  return `${mb.toFixed(1)} MB`;
}

/**
 * Sorts apps by total (tx+rx) bytes, highest first, without mutating the
 * input array — callers that hold the original list (e.g. for a "refresh only
 * if changed" comparison) must not have it silently reordered under them.
 */
export function sortNetworkUsageByTotalDesc(apps: NetworkUsageApp[]): NetworkUsageApp[] {
  return [...apps].sort((a, b) => totalNetworkBytes(b) - totalNetworkBytes(a));
}
