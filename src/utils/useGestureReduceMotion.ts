import { useSettings } from '../store/SettingsStore';
import { gestureConfig } from './gestureConfig';
import { Easing, withSpring, withTiming } from 'react-native-reanimated';
import type { MotionIntensity } from './motionIntensity';

export function useGestureReduceMotion() {
  const { settings } = useSettings();
  return settings.reduceMotion;
}

/**
 * Tri-state motion preference (#493). Consumers that need to distinguish
 * 'reduced' (withTiming) from 'off' (no transition at all) read this instead
 * of the boolean useGestureReduceMotion() — settle() below accepts either.
 */
export function useMotionIntensity(): MotionIntensity {
  const { settings } = useSettings();
  return settings.motionIntensity;
}

type SpringPreset = keyof typeof gestureConfig.spring | { stiffness: number; damping: number; mass?: number };

// Merges the release velocity into a spring preset (or custom config), so the
// spring inherits the gesture's momentum instead of always settling from a
// standstill. Split out from settle() so the merge logic is a plain,
// worklet-safe pure function that can be asserted on directly in tests.
export function resolveSpringConfig(preset: SpringPreset, velocity: number) {
  'worklet';
  const cfg = typeof preset === 'string' ? gestureConfig.spring[preset] : preset;
  return { ...cfg, velocity };
}

// Worklet-safe settle helper. Either pass a spring preset key or a custom config.
// Usage: settle(finalValue, 'mediumSettle', reduceMotion, velocity)
// NOTE: this helper is intended to be CALLED from a worklet; it returns the Reanimated
// animation primitive to assign to a shared value.
//
// The 3rd param accepts either the legacy boolean (33 existing call-sites,
// unaffected) or the tri-state MotionIntensity (#493): 'off' returns the raw
// value with no animation function at all, so `sharedValue.value = settle(...)`
// snaps instantly instead of interpolating.
export function settle(
  value: number,
  preset: SpringPreset,
  reduceMotion: boolean | MotionIntensity,
  velocity = 0,
) {
  'worklet';
  if (reduceMotion === 'off') {
    return value;
  }
  if (reduceMotion === 'full') {
    return withSpring(value, resolveSpringConfig(preset, velocity));
  }
  if (reduceMotion === 'reduced' || reduceMotion === true) {
    return withTiming(value, { duration: 180, easing: Easing.out(Easing.cubic) });
  }
  return withSpring(value, resolveSpringConfig(preset, velocity));
}
