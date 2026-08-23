/**
 * iOS «Reduce White Point» helpers.
 *
 * The user-facing `whitePointLevel` is the *intensity* of the display: 1.0 means
 * no reduction (full brightness of whites), 0.25 is the strongest reduction the
 * iOS UI allows. We render a dark overlay whose opacity is `1 - whitePointLevel`,
 * so a higher level (brighter) → lower opacity. The overlay never reaches full
 * opacity (1.0 → 0 opacity) so the UI stays visible.
 */

export const WHITE_POINT_MIN = 0.25;
export const WHITE_POINT_MAX = 1.0;

/**
 * Clamp a stored/persisted white-point level into the valid [0.25, 1.0] range.
 * Returns the default (1.0) for anything that isn't a finite number, so a
 * corrupted AsyncStorage entry can never produce a NaN or out-of-range overlay
 * opacity.
 */
export function clampWhitePointLevel(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return WHITE_POINT_MAX;
  }
  if (value < WHITE_POINT_MIN) return WHITE_POINT_MIN;
  if (value > WHITE_POINT_MAX) return WHITE_POINT_MAX;
  return value;
}

/** Convert the intensity level into the overlay opacity applied over the root. */
export function whitePointToOpacity(level: number): number {
  return 1 - clampWhitePointLevel(level);
}
