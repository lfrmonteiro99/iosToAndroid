import { useRef, useEffect } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { gestureConfig } from './gestureConfig';

export type GesturePhase =
  | 'idle'
  | 'possible'
  | 'tracking'
  | 'committed'
  | 'settling'
  | 'cancelled'
  | 'completed';

export type CommitReason = 'distance' | 'velocity' | 'hybrid' | 'hold' | 'none';

export interface CommitPredicate {
  progress: number;
  velocity: number;
  holdMs: number;
}

export interface MachineConfig {
  shouldCommit: (p: CommitPredicate) => CommitReason;
  onPhaseChange?: (phase: GesturePhase, reason: CommitReason) => void;
  onHaptic?: (moment: 'threshold' | 'commit' | 'hold-confirm') => void;
}

export interface GestureMachine {
  phase: SharedValue<GesturePhase>;
  progress: SharedValue<number>;
  commitReason: SharedValue<CommitReason>;
  startT: SharedValue<number>;
  thresholdFired: SharedValue<boolean>;
  holdFired: SharedValue<boolean>;
  reset: () => void;
}

export function useGestureMachine(cfg: MachineConfig): GestureMachine {
  const phase = useSharedValue<GesturePhase>('idle');
  const progress = useSharedValue(0);
  const commitReason = useSharedValue<CommitReason>('none');
  const startT = useSharedValue(0);
  const thresholdFired = useSharedValue(false);
  const holdFired = useSharedValue(false);

  // Store callbacks in refs so consumers can runOnJS(ref.current) without
  // stale closures forcing hook re-runs and machine recreation.
  const onPhaseChangeRef = useRef(cfg.onPhaseChange);
  const onHapticRef = useRef(cfg.onHaptic);
  const shouldCommitRef = useRef(cfg.shouldCommit);
  useEffect(() => {
    onPhaseChangeRef.current = cfg.onPhaseChange;
    onHapticRef.current = cfg.onHaptic;
    shouldCommitRef.current = cfg.shouldCommit;
  });

  function reset() {
    'worklet';
    phase.value = 'idle';
    progress.value = 0;
    commitReason.value = 'none';
    startT.value = 0;
    thresholdFired.value = false;
    holdFired.value = false;
  }

  return {
    phase,
    progress,
    commitReason,
    startT,
    thresholdFired,
    holdFired,
    reset,
  };
}

export const commitForHome = (p: CommitPredicate): CommitReason => {
  'worklet';
  if (p.progress >= gestureConfig.homeCommitProgress) return 'distance';
  if (-p.velocity >= gestureConfig.homeCommitVelocity) return 'velocity';
  if (
    p.progress >= gestureConfig.homeHybridProgress &&
    -p.velocity >= gestureConfig.homeHybridVelocity
  )
    return 'hybrid';
  return 'none';
};

export const commitForSwitcher = (p: CommitPredicate): CommitReason => {
  'worklet';
  if (
    p.holdMs >= gestureConfig.switcherHoldMinMs &&
    p.progress >= gestureConfig.switcherProgressMin &&
    p.progress <= gestureConfig.switcherProgressMax &&
    Math.abs(p.velocity) <= gestureConfig.switcherHoldVelocityMax
  )
    return 'hold';
  return 'none';
};

export const commitForBack = (p: CommitPredicate): CommitReason => {
  'worklet';
  if (p.progress >= gestureConfig.backCommitProgress) return 'distance';
  if (p.velocity >= gestureConfig.backCommitVelocity) return 'velocity';
  if (
    p.progress >= gestureConfig.backHybridProgress &&
    p.velocity >= gestureConfig.backHybridVelocity
  )
    return 'hybrid';
  return 'none';
};

export const commitForQuickSwitch = (p: CommitPredicate): CommitReason => {
  'worklet';
  const absV = Math.abs(p.velocity);
  const distDp = p.progress * gestureConfig.quickSwitchDistanceDp;
  if (p.progress >= 1) return 'distance';
  if (absV >= gestureConfig.quickSwitchVelocity) return 'velocity';
  if (
    distDp >= gestureConfig.quickSwitchHybridDistanceDp &&
    absV >= gestureConfig.quickSwitchHybridVelocity
  )
    return 'hybrid';
  return 'none';
};

export const commitForPanel = (p: CommitPredicate): CommitReason => {
  'worklet';
  if (p.progress >= gestureConfig.panelCommitProgress) return 'distance';
  if (p.velocity >= gestureConfig.panelCommitVelocity) return 'velocity';
  return 'none';
};

export const commitForNC = (p: CommitPredicate): CommitReason => {
  'worklet';
  if (p.progress >= gestureConfig.ncCommitProgress) return 'distance';
  if (p.velocity >= gestureConfig.ncCommitVelocity) return 'velocity';
  return 'none';
};

export const commitForSpotlight = (p: CommitPredicate): CommitReason => {
  'worklet';
  const progress = Math.min(1, Math.max(0, p.progress));
  const distDp = progress * gestureConfig.spotlightCommitDp;
  if (distDp >= gestureConfig.spotlightCommitDp) return 'distance';
  if (p.velocity >= gestureConfig.spotlightCommitVelocity) return 'velocity';
  return 'none';
};
