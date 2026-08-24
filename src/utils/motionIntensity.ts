/**
 * §3.1/§3.3 (issue #493): the launcher used to hard-code its motion feel — a
 * binary `reduceMotion` and a literal `0.998` scroll deceleration baked into
 * every ScrollView. Both numbers are estimates the spec itself flags as
 * needing calibration, so they're exposed as settings instead of constants.
 */
export type MotionIntensity = 'full' | 'reduced' | 'off';
export const DEFAULT_MOTION_INTENSITY: MotionIntensity = 'full';

const VALID_MOTION_INTENSITY: readonly MotionIntensity[] = ['full', 'reduced', 'off'];

/**
 * Normalizes a persisted `motionIntensity` value on AsyncStorage hydration.
 * `legacyReduceMotion` migrates pre-#493 blobs that only ever wrote the
 * boolean `reduceMotion` field: `true` becomes `'reduced'` (the exact
 * behaviour `reduceMotion` used to produce), anything else falls back to the
 * default `'full'`. An already-valid `motionIntensity` always wins over the
 * legacy field, so re-hydrating a blob written by this version never
 * regresses to the migration path.
 */
export function normalizeMotionIntensity(value: unknown, legacyReduceMotion?: unknown): MotionIntensity {
  if (typeof value === 'string' && (VALID_MOTION_INTENSITY as readonly string[]).includes(value)) {
    return value as MotionIntensity;
  }
  if (legacyReduceMotion === true) return 'reduced';
  return DEFAULT_MOTION_INTENSITY;
}

export type ScrollDeceleration = 'normal' | 'fast';
export const DEFAULT_SCROLL_DECELERATION: ScrollDeceleration = 'normal';

export function normalizeScrollDeceleration(value: unknown): ScrollDeceleration {
  return value === 'fast' ? 'fast' : DEFAULT_SCROLL_DECELERATION;
}

/** iOS-observed deceleration constants (§3.1) — 'fast' is the tighter iPadOS-style curve. */
export function scrollDecelerationValue(pref: ScrollDeceleration): number {
  return pref === 'fast' ? 0.99 : 0.998;
}
