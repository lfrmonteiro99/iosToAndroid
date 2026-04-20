import * as Haptics from 'expo-haptics';
import { hapticImpact, hapticSelection } from './haptics';

export type HapticMoment = 'threshold' | 'hold-confirm' | 'commit';
export type CommitWeight = 'light' | 'medium' | 'heavy';

const WEIGHT_MAP = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
} as const;

export const GestureHaptics = {
  threshold: () => hapticSelection().catch(() => {}),
  holdConfirm: () => hapticImpact(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  commit: (weight: CommitWeight = 'light') =>
    hapticImpact(WEIGHT_MAP[weight]).catch(() => {}),
};
