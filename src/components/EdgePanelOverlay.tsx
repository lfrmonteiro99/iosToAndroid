import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { gestureConfig } from '../utils/gestureConfig';
import { useVelocityBuffer, pushSample, sampledVelocity } from '../utils/gestureVelocity';
import type { CommitPredicate, CommitReason } from '../utils/gestureMachine';
import { settle, useGestureReduceMotion } from '../utils/useGestureReduceMotion';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Zone {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface EdgePanelOverlayProps {
  zone: Zone;
  onCommit: () => void;
  /** Fraction of SCREEN_HEIGHT that the preview sheet occupies (e.g. 0.55 for CC, 0.65 for NC) */
  sheetHeightFraction: number;
  /** Determines whether the drag gesture should hand off to the full screen */
  commitPredicate: (p: CommitPredicate) => CommitReason;
  children: React.ReactNode;
}

export function EdgePanelOverlay({
  zone,
  onCommit,
  sheetHeightFraction,
  commitPredicate,
  children,
}: EdgePanelOverlayProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useGestureReduceMotion();
  const reduceMotionShared = useSharedValue(reduceMotion);
  useEffect(() => {
    reduceMotionShared.value = reduceMotion;
    // Shared values are stable refs; only respond to reduceMotion changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  const panelProgress = useSharedValue(0);
  const buf = useVelocityBuffer();
  const startedInZone = useSharedValue(false);
  // Seeded to 0; overwritten to Date.now() on the first onUpdate event before any use
  const currentT = useSharedValue(0);

  const pan = Gesture.Pan()
    .onBegin((e) => {
      'worklet';
      buf.value = [];
      startedInZone.value =
        e.absoluteX >= zone.left &&
        e.absoluteX <= zone.right &&
        e.absoluteY >= zone.top &&
        e.absoluteY <= zone.bottom;
      currentT.value = 0;
    })
    .onUpdate((e) => {
      'worklet';
      if (!startedInZone.value) return;
      currentT.value = Date.now();
      pushSample(buf.value, e.translationX, e.translationY, currentT.value);
      const dy = Math.max(0, e.translationY);
      panelProgress.value = Math.max(0, Math.min(1, dy / gestureConfig.panelTravelDp));
    })
    .onEnd((e) => {
      'worklet';
      if (!startedInZone.value) {
        panelProgress.value = settle(0, 'fastSettle', reduceMotionShared.value);
        return;
      }
      currentT.value = Date.now();
      pushSample(buf.value, e.translationX, e.translationY, currentT.value);
      const { vy } = sampledVelocity(buf.value, currentT.value);
      const progress = panelProgress.value;
      const reason = commitPredicate({ progress, velocity: vy, holdMs: 0 });
      if (reason !== 'none') {
        // Hand off to the real screen: retract the preview so it doesn't
        // linger underneath the transparent modal and block the home screen
        // when the user returns.
        panelProgress.value = settle(0, 'fastSettle', reduceMotionShared.value);
        runOnJS(onCommit)();
      } else {
        panelProgress.value = settle(0, 'fastSettle', reduceMotionShared.value);
      }
    });

  const sheetStyle = useAnimatedStyle(() => {
    'worklet';
    const translateY = -SCREEN_HEIGHT * (1 - panelProgress.value);
    // When fully retracted, drop the view out of the render tree so its
    // layout-based hit area cannot absorb taps on the home content behind it.
    const display = panelProgress.value <= 0.001 ? 'none' : 'flex';
    return { transform: [{ translateY }], display };
  });

  const backdropStyle = useAnimatedStyle(() => {
    'worklet';
    const opacity = panelProgress.value * 0.5;
    const display = panelProgress.value <= 0.001 ? 'none' : 'flex';
    return { opacity, display };
  });

  const zoneWidth = zone.right - zone.left;
  const zoneHeight = zone.bottom - zone.top;

  return (
    <>
      {/* Dark backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
        pointerEvents="none"
      />

      {/* Sliding preview sheet — visual only, hidden from screen readers */}
      <Animated.View
        style={[
          styles.sheet,
          { height: SCREEN_HEIGHT * sheetHeightFraction, paddingTop: insets.top + 12 },
          sheetStyle,
        ]}
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.handle} />
        {children}
      </Animated.View>

      {/* Activation zone — intercepts touches in the trigger strip; hidden from TalkBack */}
      <View
        style={[
          styles.activationZone,
          { top: zone.top, left: zone.left, width: zoneWidth, height: zoneHeight },
        ]}
        pointerEvents="auto"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <GestureDetector gesture={pan}>
          <View style={StyleSheet.absoluteFill} />
        </GestureDetector>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: '#000',
  },
  sheet: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(28,28,30,0.92)',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginBottom: 16,
  },
  activationZone: {
    position: 'absolute',
  },
});
