import type { SettingsState } from '../store/SettingsStore';

/**
 * Power/performance profiles (#631 child).
 *
 * iOS has no first-class equivalent, but the request mirrors Android's
 * "Performance / Battery saver / Sleep" style power modes: one picker that
 * flips a related set of settings at once. Selecting a profile both records
 * the choice (`settings.performanceProfile`) and fires its *triggers* — a
 * partial settings patch applied through `updateMany` so the rest of the app
 * reacts immediately (Low Power Mode toggle, transparency, white point, …).
 *
 * The mapping lives here, in pure functions, so it is unit-testable without
 * rendering a screen or touching AsyncStorage.
 */

export type PerformanceProfile =
  | 'normal'
  | 'performance'
  | 'saver'
  | 'sleep'
  | 'travel';

export interface PerformanceProfileDef {
  key: PerformanceProfile;
  /** Label shown inside the segmented control. */
  label: string;
  /** One-line explanation of what the profile is for. */
  description: string;
  /**
   * Settings patch applied whenever this profile becomes active. Applied via
   * `updateMany`, so it must only contain keys that exist on `SettingsState`.
   * `normal` is the baseline and carries no patch — selecting it never forces
   * unrelated settings off.
   */
  triggers: Partial<SettingsState>;
}

/** Stable, display-ordered list — drives the segmented control's `values`. */
export const PERFORMANCE_PROFILES: Record<PerformanceProfile, PerformanceProfileDef> = {
  normal: {
    key: 'normal',
    label: 'Normal',
    description: 'Balanced defaults. No settings are changed.',
    triggers: {},
  },
  performance: {
    key: 'performance',
    label: 'Performance',
    description: 'Best responsiveness: Low Power Mode off, transparency on.',
    triggers: {
      lowPowerMode: false,
      reduceTransparency: false,
    },
  },
  saver: {
    key: 'saver',
    label: 'Saver',
    description: 'Extend battery: Low Power Mode and Reduce Transparency on.',
    triggers: {
      lowPowerMode: true,
      reduceTransparency: true,
    },
  },
  sleep: {
    key: 'sleep',
    label: 'Sleep',
    description: 'Wind down: Low Power Mode and Reduce White Point on.',
    triggers: {
      lowPowerMode: true,
      reduceWhitePoint: true,
    },
  },
  travel: {
    key: 'travel',
    label: 'Travel',
    description: 'Away from home: Low Power Mode on, Location Services on.',
    triggers: {
      lowPowerMode: true,
      locationServices: true,
    },
  },
};

/** Display order for the segmented control values. */
export const PERFORMANCE_PROFILE_ORDER: PerformanceProfile[] = [
  'normal',
  'performance',
  'saver',
  'sleep',
  'travel',
];

export const PERFORMANCE_PROFILE_LABELS: string[] = PERFORMANCE_PROFILE_ORDER.map(
  (key) => PERFORMANCE_PROFILES[key].label,
);

const VALID_PROFILES = new Set<string>(PERFORMANCE_PROFILE_ORDER);

/**
 * Coerce an arbitrary stored/serialized value into a valid profile key.
 * Anything that is not one of the five known keys collapses to `'normal'`
 * (the baseline), so a corrupted blob can never activate an unknown mode.
 */
export function normalizePerformanceProfile(value: unknown): PerformanceProfile {
  return VALID_PROFILES.has(value as string) ? (value as PerformanceProfile) : 'normal';
}

/**
 * The settings patch a profile applies when selected. Unknown input is treated
 * as `'normal'`, which has no patch — so a bad profile can never blow up or
 * silently apply a foreign partial.
 */
export function getPerformanceProfileTriggers(
  profile: PerformanceProfile | string | undefined | null,
): Partial<SettingsState> {
  const key = normalizePerformanceProfile(profile);
  return PERFORMANCE_PROFILES[key].triggers;
}

/** Index of a profile in the display order, or 0 ('normal') if unknown. */
export function performanceProfileIndex(profile: PerformanceProfile | string | undefined | null): number {
  const key = normalizePerformanceProfile(profile);
  return PERFORMANCE_PROFILE_ORDER.indexOf(key);
}
