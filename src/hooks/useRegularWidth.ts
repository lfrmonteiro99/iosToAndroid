import { useEffect, useState } from 'react';
import { Dimensions, ScaledSize } from 'react-native';

/**
 * iOS "regular width" size-class threshold, in points.
 *
 * On iPad the system promotes the horizontal size class to `regular` once the
 * window is comfortably wide; we mirror that with a 700pt breakpoint so phones
 * (≤ ~430pt wide) always keep the compact chrome and tablets / large windows
 * get the expanded chrome (#633 — sidebar + content on regular width).
 */
export const REGULAR_WIDTH_BREAKPOINT = 700;

function isRegularWidth(dim: ScaledSize): boolean {
  return dim.width >= REGULAR_WIDTH_BREAKPOINT;
}

/**
 * Returns true when the current window is at a "regular" horizontal width
 * (tablet / large window) and false on compact width (phone). Re-evaluates on
 * every resize, so rotating a foldable or resizing a freeform window flips the
 * layout live.
 */
export function useRegularWidth(): boolean {
  const [regular, setRegular] = useState(() =>
    isRegularWidth(Dimensions.get('window')),
  );

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setRegular(isRegularWidth(window));
    });
    return () => sub.remove();
  }, []);

  return regular;
}
