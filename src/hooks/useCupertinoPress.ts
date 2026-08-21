import { useCallback } from 'react';
import { useSharedValue, useAnimatedStyle, interpolate } from 'react-native-reanimated';
import { useGestureReduceMotion, settle } from '../utils/useGestureReduceMotion';

// useCupertinoPress — shared touch-feedback primitive for iOS-style press states.
//
// WHY: before this hook there were four concurrent press-feedback conventions
// across the app (a custom Reanimated scale, android_ripple, six different
// opacity values via `style={({pressed}) => ...}`, and Material-style
// backgroundColor swaps) — see issue #495 / epic #468. This collapses the
// scale+dim feedback into ONE primitive. Migration of the existing sites is a
// separate sub-issue; this hook is only the primitive plus one demonstration
// adoption (CupertinoButton).
//
// CONVENTION RULE — which feedback to use for which surface (per §3.2 of
// ESPECIFICACAO.md):
//   1. ICON / BUTTON surface  → useCupertinoPress (scale 0.96 + opacity 0.40).
//      The 0.40 dim is the §3.2 number for icon-type surfaces. Override
//      `opacity` for dense lists where 0.40 reads as aggressive.
//   2. LIST ROW (full-width)  → useCupertinoPress with { opacityOnly: true } OR
//      just swap backgroundColor (the existing Material-style pattern is in fact
//      the correct iOS choice for list rows — do NOT scale a full-width row, it
//      looks wrong). Choose opacityOnly (dim + no scale) for parity, or keep the
//      backgroundColor swap if the row already has a tint background.
//   3. Ripples (android_ripple) are Android-native affordances and remain for
//      their specific call sites; they are not replaced by this hook.
//
// reduceMotion / motionIntensity: the device `reduceMotion` setting is honoured
// via settle() (withTiming instead of withSpring). NOTE: the repo only stores a
// boolean `reduceMotion` in SettingsStore — there is no `motionIntensity`
// setting, so this hook takes reduceMotion as the single source of truth.

export interface UseCupertinoPressOptions {
  /** Target opacity at full press. Defaults to 0.40 (§3.2). Override for dense surfaces. */
  opacity?: number;
  /** Target scale at full press. Defaults to 0.96 (§3.2). Ignored when opacityOnly. */
  scale?: number;
  /** When true, only opacity changes (no scale) — for full-width list rows. */
  opacityOnly?: boolean;
  /** Override the device reduceMotion setting; defaults to settings.reduceMotion. */
  reduceMotion?: boolean;
}

export interface CupertinoPressResult {
  style: {
    transform?: Array<{ scale: number }>;
    opacity: number;
  };
  onPressIn: () => void;
  onPressOut: () => void;
}

const DEFAULT_OPACITY = 0.4;
const DEFAULT_SCALE = 0.96;

export function useCupertinoPress(
  enabled = true,
  options: UseCupertinoPressOptions = {},
): CupertinoPressResult {
  const {
    opacity = DEFAULT_OPACITY,
    scale = DEFAULT_SCALE,
    opacityOnly = false,
    reduceMotion: reduceMotionOverride,
  } = options;

  const deviceReduceMotion = useGestureReduceMotion();
  const reduceMotion = reduceMotionOverride ?? deviceReduceMotion;

  const pressed = useSharedValue(0);

  const style = useAnimatedStyle(() => {
    const next: { transform?: Array<{ scale: number }>; opacity: number } = {
      opacity: interpolate(pressed.value, [0, 1], [1, opacity]),
    };
    if (!opacityOnly) {
      next.transform = [{ scale: interpolate(pressed.value, [0, 1], [1, scale]) }];
    }
    return next;
  });

  const onPressIn = useCallback(() => {
    if (!enabled) return;
    // settle() honours reduceMotion: withTiming when reduced, withSpring otherwise.
    pressed.value = settle(1, 'mediumSettle', reduceMotion);
  }, [enabled, pressed, reduceMotion]);

  const onPressOut = useCallback(() => {
    if (!enabled) return;
    pressed.value = settle(0, 'mediumSettle', reduceMotion);
  }, [enabled, pressed, reduceMotion]);

  return { style, onPressIn, onPressOut };
}
