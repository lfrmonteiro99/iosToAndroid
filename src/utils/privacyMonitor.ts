import type { PrivacyReport, PrivacySensorSummary, PrivacySensorUsage } from '../../modules/launcher-module/src';

/**
 * Privacy Monitor (#624) data helpers.
 *
 * The native report is a flat `PrivacySensorSummary[]`. The dashboard needs two
 * derived shapes:
 *  - a ranked, absolute per-app breakdown so the longest bar is fully scaled;
 *  - a normalized 0..1 ratio per app so each card's bars are comparable
 *    regardless of which sensor; count is the membership flag (always 1), so
 *    normalization is by max-per-sensor only.
 *
 * These are pure functions: no React, no LauncherModule, no clock. That keeps
 * the bar math unit-testable in isolation (the red step proves the test is
 * wired to the behaviour, not a copy of the formula).
 */

export interface PrivacyAppBreakdownRow {
  packageName: string;
  appName: string;
  count: number;
  /** count / maxCount, clamped to [0, 1]. 0 when the card has no accesses. */
  ratio: number;
}

export interface PrivacySensorView extends PrivacySensorSummary {
  breakdown: PrivacyAppBreakdownRow[];
  hasAccesses: boolean;
}

/**
 * Turn one sensor summary into a view with a ranked, normalized per-app
 * breakdown. Apps with count <= 0 are dropped defensively (native can emit
 * partial entries); an otherwise-empty sensor yields `hasAccesses:false`
 * and an empty breakdown rather than a divide-by-zero NaN ratio.
 */
export function sensorBreakdown(summary: PrivacySensorSummary): PrivacyAppBreakdownRow[] {
  const ranked: PrivacySensorUsage[] = [...summary.topApps]
    .filter((u) => Number.isFinite(u.count) && u.count > 0)
    .sort((a, b) => b.count - a.count);

  const maxCount = ranked.length > 0 ? ranked[0].count : 0;

  return ranked.map((u) => ({
    packageName: u.packageName,
    appName: u.appName,
    count: u.count,
    ratio: maxCount > 0 ? Math.min(1, Math.max(0, u.count / maxCount)) : 0,
  }));
}

/** Attach a normalized breakdown + convenience flags to every sensor. */
export function toPrivacySensorViews(report: PrivacyReport): PrivacySensorView[] {
  return (report?.sensors ?? []).map((summary) => {
    const breakdown = sensorBreakdown(summary);
    return {
      ...summary,
      breakdown,
      hasAccesses: breakdown.length > 0,
    };
  });
}

/**
 * Total accesses across every sensor — used for the dashboard header. Returns 0
 * for a null/empty report instead of throwing, and ignores any non-finite
 * sensor totals (defensive: native can emit partial maps on older Android).
 */
export function totalAccessCount(report: PrivacyReport | null | undefined): number {
  if (!report || !Array.isArray(report.sensors)) return 0;
  return report.sensors.reduce(
    (sum, s) => sum + (Number.isFinite(s.totalAccesses) ? s.totalAccesses : 0),
    0,
  );
}
