import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  useFrameCallback,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { gestureConfig } from '../utils/gestureConfig';
import { useVelocityBuffer, pushSample, sampledVelocity } from '../utils/gestureVelocity';
import { commitForSpotlight } from '../utils/gestureMachine';
import { settle, useGestureReduceMotion } from '../utils/useGestureReduceMotion';

interface SpotlightRevealProps {
  enabled: boolean;   // false when folder open / jiggling / anything that should suppress
  onCommit: () => void; // called at settling — navigates to SpotlightSearch
}

export function SpotlightReveal({ enabled, onCommit }: SpotlightRevealProps) {
  const reduceMotion = useGestureReduceMotion();
  const reduceMotionShared = useSharedValue(reduceMotion);
  useEffect(() => {
    reduceMotionShared.value = reduceMotion;
  }, [reduceMotion, reduceMotionShared]);

  const progress = useSharedValue(0);   // 0..1 relative to spotlightCommitDp
  const thresholdFired = useSharedValue(false);
  const buf = useVelocityBuffer();
  const currentT = useSharedValue(0);

  useFrameCallback(({ timestamp }) => {
    'worklet';
    currentT.value = timestamp;
  });

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetY([gestureConfig.axisLockDp, 9999])
    .onBegin(() => {
      'worklet';
      progress.value = 0;
      thresholdFired.value = false;
      buf.value = [];
    })
    .onUpdate((e) => {
      'worklet';
      const dy = Math.max(0, e.translationY);
      pushSample(buf.value, e.translationX, e.translationY, currentT.value);
      // Below reveal start, stay at 0 — spec §11.2 says don't interpolate noise
      if (dy < gestureConfig.spotlightRevealDp) {
        progress.value = 0;
        return;
      }
      // Map dy to 0..1 over spotlightCommitDp so progress >= 1 means committed-by-distance
      progress.value = Math.min(1.5, (dy - gestureConfig.spotlightRevealDp) / gestureConfig.spotlightCommitDp);
    })
    .onEnd((e) => {
      'worklet';
      pushSample(buf.value, e.translationX, e.translationY, currentT.value);
      const { vy } = sampledVelocity(buf.value, currentT.value);
      // Pass the distance-normalised progress (clamped) to commitForSpotlight
      const p = Math.min(1, Math.max(0, progress.value));
      const reason = commitForSpotlight({ progress: p, velocity: vy, holdMs: 0 });
      if (reason !== 'none') {
        progress.value = settle(1.5, 'mediumSettle', reduceMotionShared.value);
        runOnJS(onCommit)();
      } else {
        progress.value = settle(0, 'fastSettle', reduceMotionShared.value);
      }
    });

  // Animated affordance: search field that slides in from above
  const fieldStyle = useAnimatedStyle(() => {
    'worklet';
    const p = Math.min(1, progress.value);
    return {
      opacity: p,
      transform: [{ translateY: (p - 1) * 30 }], // slides from -30 to 0
    };
  });

  const dimStyle = useAnimatedStyle(() => {
    'worklet';
    const p = Math.min(1, progress.value);
    return { opacity: p * 0.4 };
  });

  return (
    <>
      {/* Full-screen dim overlay behind the content */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}
      />
      {/* Search field affordance — preview only, real field is on SpotlightSearchScreen */}
      <Animated.View
        pointerEvents="none"
        style={[styles.fieldHolder, fieldStyle]}
        accessibilityLabel="Spotlight Search"
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Search</Text>
        </View>
      </Animated.View>
      {/* Invisible activation region — hidden from TalkBack */}
      <GestureDetector gesture={pan}>
        <View
          style={styles.hitArea}
          collapsable={false}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        />
      </GestureDetector>
    </>
  );
}

const styles = StyleSheet.create({
  dim: {
    backgroundColor: '#000',
    zIndex: 19,
  },
  fieldHolder: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    top: 80,
    zIndex: 21,
    alignItems: 'center',
  },
  field: {
    width: '100%',
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    fontWeight: '400',
  },
  hitArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 60,
    bottom: 60,
    zIndex: 20,
  },
});
