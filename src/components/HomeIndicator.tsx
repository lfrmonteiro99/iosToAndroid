import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useFrameCallback,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { gestureConfig } from '../utils/gestureConfig';
import { pushSample, sampledVelocity, useVelocityBuffer } from '../utils/gestureVelocity';
import { useGestureMachine, commitForHome, commitForSwitcher } from '../utils/gestureMachine';
import { hapticImpact, hapticSelection } from '../utils/haptics';

// Keep idle-dim constants local (not gesture thresholds — these are UI-only)
const IDLE_DIM_MS = 2500; // ms — pill fades after inactivity
const IDLE_OPACITY = 0.35;

interface HomeIndicatorProps {
  /** Override the home action. Defaults to native goHome() on Android. */
  onHome?: () => void;
  /** Override the app-switcher action. Defaults to navigating to the Multitask route via navigationRef. */
  onSwitcher?: () => void;
  /** NavigationContainer ref used for the default switcher fallback. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigationRef?: NavigationContainerRefWithCurrent<any>;
  /** Light pill (default) or dark pill for light backgrounds. */
  variant?: 'light' | 'dark';
}

export function HomeIndicator({ onHome, onSwitcher, navigationRef, variant = 'light' }: HomeIndicatorProps) {
  const insets = useSafeAreaInsets();

  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Frame-callback timestamp — updated every frame on the UI thread, safe to
  // read from inside Pan worklets without JS round-trips.
  const currentT = useSharedValue(0);
  useFrameCallback(({ timestamp }) => {
    'worklet';
    currentT.value = timestamp;
  });

  // Multi-sample velocity buffer
  const buf = useVelocityBuffer();

  // Shared state machine (home commit predicate)
  const machine = useGestureMachine({ shouldCommit: commitForHome });

  const wake = useCallback(() => {
    opacity.value = withTiming(1, { duration: 150 });
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      opacity.value = withTiming(IDLE_OPACITY, { duration: 600 });
    }, IDLE_DIM_MS);
  }, [opacity]);

  useEffect(() => {
    wake();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [wake]);

  const doHome = useCallback(async () => {
    hapticImpact(Haptics.ImpactFeedbackStyle.Medium);
    if (onHome) return onHome();
    if (Platform.OS === 'android') {
      try {
        const mod = (await import('../../modules/launcher-module/src')).default;
        const ok = await mod.goHome();
        if (ok) return;
      } catch {
        /* fall through */
      }
    }
    try {
      navigationRef?.current?.navigate('HomeMain' as never);
    } catch {
      /* no-op */
    }
  }, [onHome, navigationRef]);

  const doSwitcher = useCallback(() => {
    hapticImpact(Haptics.ImpactFeedbackStyle.Heavy);
    if (onSwitcher) return onSwitcher();
    try {
      navigationRef?.current?.navigate('Multitask' as never);
    } catch {
      /* route may not exist in some contexts */
    }
  }, [onSwitcher, navigationRef]);

  const fireHapticThreshold = useCallback(() => {
    hapticSelection();
  }, []);

  const fireHapticHoldConfirm = useCallback(() => {
    hapticImpact(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const pan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .minDistance(8)
    .onBegin(() => {
      'worklet';
      machine.reset();
      machine.startT.value = currentT.value;
      machine.phase.value = 'possible';
      buf.value = [];
      runOnJS(wake)();
    })
    .onUpdate((e) => {
      'worklet';
      machine.phase.value = 'tracking';

      const dy = Math.min(0, e.translationY); // only track upward
      translateY.value = dy;

      // Clamp progress [0,1] based on upward travel vs full homeTravelDp
      const progress = Math.max(0, Math.min(1, -dy / gestureConfig.homeTravelDp));
      machine.progress.value = progress;

      // Push sample into velocity buffer
      pushSample(buf.value, e.translationX, e.translationY, currentT.value);
      const { vy } = sampledVelocity(buf.value, currentT.value);

      // Axis-lock: cancel if lateral drift exceeds threshold
      if (Math.abs(e.translationX) > gestureConfig.axisLockDp * 8) {
        translateY.value = withSpring(0, gestureConfig.spring.homeSettle);
        machine.phase.value = 'cancelled';
        return;
      }

      // Haptic tick at hybrid-progress threshold crossing
      if (!machine.thresholdFired.value && progress >= gestureConfig.homeHybridProgress) {
        machine.thresholdFired.value = true;
        runOnJS(fireHapticThreshold)();
      }

      // Switcher hold predicate check (in-worklet — no setInterval)
      if (!machine.holdFired.value) {
        const holdMs = currentT.value - machine.startT.value;
        const switcherResult = commitForSwitcher({ progress, velocity: vy, holdMs });
        if (switcherResult === 'hold') {
          machine.holdFired.value = true;
          runOnJS(fireHapticHoldConfirm)();
        }
      }
    })
    .onEnd((e) => {
      'worklet';
      translateY.value = withSpring(0, gestureConfig.spring.homeSettle);

      const dy = Math.min(0, e.translationY);
      const progress = Math.max(0, Math.min(1, -dy / gestureConfig.homeTravelDp));

      // Final velocity from multi-sample buffer
      pushSample(buf.value, e.translationX, e.translationY, currentT.value);
      const { vy } = sampledVelocity(buf.value, currentT.value);

      const holdMs = currentT.value - machine.startT.value;

      if (machine.phase.value === 'cancelled') {
        return;
      }

      // Switcher: hold was confirmed during drag
      if (machine.holdFired.value) {
        runOnJS(doSwitcher)();
        return;
      }

      // Home: evaluate three-path commit predicate
      const homeResult = commitForHome({ progress, velocity: vy, holdMs });
      if (homeResult !== 'none') {
        runOnJS(doHome)();
      }
    });

  // AssistiveTouch-inspired convenience: double-tap the pill as a shortcut
  // to the app switcher for users who find the precise swipe awkward.
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((_e, success) => {
      'worklet';
      if (success) runOnJS(doSwitcher)();
    });

  const combined = Gesture.Simultaneous(pan, doubleTap);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    // Pill rises ~10dp at full progress (machine.progress.value = 1)
    transform: [{ translateY: machine.progress.value * -10 }],
  }));

  const pillColor = variant === 'dark' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)';

  return (
    <GestureDetector gesture={combined}>
      <Animated.View
        pointerEvents="box-only"
        style={[styles.hitArea, { paddingBottom: Math.max(insets.bottom, 6) }]}
        accessibilityLabel="Home indicator. Swipe up to go home. Swipe up and hold for app switcher."
        accessibilityRole="button"
      >
        <Animated.View style={[styles.pill, { backgroundColor: pillColor }, pillStyle]} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  hitArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 14, // tall catch area above the pill for easier swipes
    zIndex: 50,
  },
  pill: {
    width: 134,
    height: 5,
    borderRadius: 2.5,
  },
});
