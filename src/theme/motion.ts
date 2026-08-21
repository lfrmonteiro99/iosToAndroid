/**
 * Pure motion helpers (no React, no React Native).
 *
 * UIScrollView rubber-band resistance, per ESPECIFICACAO.md §3.3.
 * Both functions carry the 'worklet' directive so Reanimated runs them on the
 * UI thread — without it the scroll stutters (see commit 1a15ca6).
 */

/** iOS rubber-band constant used by UIScrollView. */
export const RUBBER_C = 0.55;

/**
 * Elastic resistance of UIScrollView.
 *
 * @param distance how far past the bound the gesture went (positive).
 * @param dimension the scrollable dimension (viewport length).
 * @returns the damped displacement; 0 for non-positive dimension or distance.
 */
export function rubberBand(distance: number, dimension: number): number {
  'worklet';
  if (!(dimension > 0)) return 0;
  if (!(distance > 0)) return 0;
  return (1 - 1 / ((distance * RUBBER_C) / dimension + 1)) * (dimension / RUBBER_C);
}

/**
 * Applies rubber-band resistance only outside [min, max];
 * inside the range the value is returned untouched.
 */
export function clampWithRubberBand(
  value: number,
  min: number,
  max: number,
  dimension: number,
): number {
  'worklet';
  if (value < min) return min - rubberBand(min - value, dimension);
  if (value > max) return max + rubberBand(value - max, dimension);
  return value;
}
