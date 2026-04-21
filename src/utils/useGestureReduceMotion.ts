import { useSettings } from '../store/SettingsStore';
import { gestureConfig } from './gestureConfig';
import { Easing, withSpring, withTiming } from 'react-native-reanimated';

export function useGestureReduceMotion() {
  const { settings } = useSettings();
  return settings.reduceMotion;
}

// Worklet-safe settle helper. Either pass a spring preset key or a custom config.
// Usage: settle(finalValue, 'mediumSettle', reduceMotion)
// NOTE: this helper is intended to be CALLED from a worklet; it returns the Reanimated
// animation primitive to assign to a shared value.
export function settle(
  value: number,
  preset: keyof typeof gestureConfig.spring | { stiffness: number; damping: number; mass?: number },
  reduceMotion: boolean,
) {
  'worklet';
  if (reduceMotion) {
    return withTiming(value, { duration: 180, easing: Easing.out(Easing.cubic) });
  }
  const cfg = typeof preset === 'string' ? gestureConfig.spring[preset] : preset;
  return withSpring(value, cfg);
}
