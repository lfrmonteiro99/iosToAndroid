import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

// iOS-matched thresholds (from reverse-engineered gesture behavior):
// - Home:         short upward swipe OR high upward velocity
// - App switcher: deeper upward swipe with a hold/pause near mid-screen
// - Lateral drift cancels the gesture
const HOME_DISTANCE = 60;          // pt — short swipe triggers home
const SWITCHER_DISTANCE = 180;     // pt — deeper swipe with pause triggers app switcher
const HOME_VELOCITY = 500;         // pt/s — flick velocity alternative to distance
const SWITCHER_HOLD_MS = 400;      // ms — hold near mid-swipe to summon switcher
const LATERAL_CANCEL = 80;         // pt — sideways drift cancels the gesture
const IDLE_DIM_MS = 2500;          // ms — pill fades after inactivity (AssistiveTouch-inspired)
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (onSwitcher) return onSwitcher();
    try {
      navigationRef?.current?.navigate('Multitask' as never);
    } catch {
      /* route may not exist in some contexts */
    }
  }, [onSwitcher, navigationRef]);

  // Track whether a mid-swipe hold triggered "switcher mode" already
  const heldForSwitcher = useSharedValue(0);
  const holdScheduled = useSharedValue(0);
  const thresholdHapticFired = useSharedValue(0);

  const fireLightHaptic = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const pan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .minDistance(8)
    .onBegin(() => {
      'worklet';
      heldForSwitcher.value = 0;
      holdScheduled.value = 0;
      thresholdHapticFired.value = 0;
      runOnJS(wake)();
    })
    .onUpdate((e) => {
      'worklet';
      const dy = Math.min(0, e.translationY); // only track upward
      translateY.value = dy;

      // Haptic tick the first time we cross the "home" threshold
      if (!thresholdHapticFired.value && Math.abs(dy) >= HOME_DISTANCE) {
        thresholdHapticFired.value = 1;
        runOnJS(fireLightHaptic)();
      }

      // Lateral drift cancels — match iOS's lock-to-axis behavior
      if (Math.abs(e.translationX) > LATERAL_CANCEL) {
        translateY.value = withSpring(0, { damping: 15, stiffness: 180 });
        thresholdHapticFired.value = 0;
      }
    })
    .onEnd((e) => {
      'worklet';
      const dy = Math.min(0, e.translationY);
      const vy = e.velocityY;
      translateY.value = withSpring(0, { damping: 20, stiffness: 220 });

      // Deep swipe OR held mid-swipe → app switcher
      if (Math.abs(dy) >= SWITCHER_DISTANCE || heldForSwitcher.value === 1) {
        runOnJS(doSwitcher)();
        return;
      }
      // Short swipe OR flick → home
      if (Math.abs(dy) >= HOME_DISTANCE || vy <= -HOME_VELOCITY) {
        runOnJS(doHome)();
      }
    });

  // Separate detector for the "hold at midpoint" behavior, used alongside pan.
  // When the user pauses their finger past the home threshold but below
  // switcher-distance, we summon the switcher after SWITCHER_HOLD_MS.
  useEffect(() => {
    const id = setInterval(() => {
      const dy = Math.abs(translateY.value);
      if (dy >= HOME_DISTANCE && dy < SWITCHER_DISTANCE) {
        if (!holdScheduled.value) {
          holdScheduled.value = 1;
          setTimeout(() => {
            if (Math.abs(translateY.value) >= HOME_DISTANCE && Math.abs(translateY.value) < SWITCHER_DISTANCE) {
              heldForSwitcher.value = 1;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            }
          }, SWITCHER_HOLD_MS);
        }
      } else {
        holdScheduled.value = 0;
      }
    }, 80);
    return () => clearInterval(id);
  }, [translateY, holdScheduled, heldForSwitcher]);

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
    transform: [{ translateY: translateY.value * 0.15 }], // subtle follow while swiping
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
