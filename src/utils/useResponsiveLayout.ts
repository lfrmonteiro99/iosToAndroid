import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * Responsive layout detection (spec §24 — Responsive/tablet layout).
 *
 * iOS (and iPadOS) classify width into size classes:
 *   - Compact:  phones, and iPad in Split View with a narrow column
 *   - Regular:  iPad full-width (portrait ≈ 768dp, landscape wider)
 *
 * We use a single width threshold. Below `REGULAR_WIDTH_BREAKPOINT` the app
 * keeps the phone layout (floating tab bar / gesture-driven home, single
 * column). At or above it we render the tablet layout (stable left sidebar +
 * content pane to the right) — the same width class iOS uses to switch iPad
 * apps into their two-column form.
 *
 * The breakpoint is 768 (the iPad's logical portrait width). It deliberately
 * sits ABOVE the Jest default window width of 750px so that, in the test
 * environment, screens keep rendering their phone layout unless a test
 * explicitly mocks a wider window — existing phone-layout assertions are
 * therefore untouched.
 */
export const REGULAR_WIDTH_BREAKPOINT = 768;

export type LayoutKind = 'compact' | 'regular';

export interface ResponsiveLayout {
  /** 'compact' below the breakpoint, 'regular' at/above it. */
  layout: LayoutKind;
  /** True when the width class is regular (tablet). */
  isTablet: boolean;
  /** Raw window width in logical points. */
  width: number;
  /** Raw window height in logical points. */
  height: number;
}

/**
 * Pure classifier. Extracted so it can be unit-tested without rendering a
 * component or faking the window dimensions.
 */
export function detectLayout(
  width: number,
  breakpoint: number = REGULAR_WIDTH_BREAKPOINT,
): LayoutKind {
  if (!Number.isFinite(width) || width <= 0) return 'compact';
  return width >= breakpoint ? 'regular' : 'compact';
}

export function useResponsiveLayout(
  breakpoint: number = REGULAR_WIDTH_BREAKPOINT,
): ResponsiveLayout {
  const { width, height } = useWindowDimensions();
  return useMemo<ResponsiveLayout>(() => {
    const layout = detectLayout(width, breakpoint);
    return {
      layout,
      isTablet: layout === 'regular',
      width,
      height,
    };
  }, [width, height, breakpoint]);
}
