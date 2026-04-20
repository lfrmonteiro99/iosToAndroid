import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useFrameCallback,
  runOnJS,
  withTiming,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';

import { gestureConfig } from '../utils/gestureConfig';
import { pushSample, sampledVelocity, useVelocityBuffer } from '../utils/gestureVelocity';
import { commitForBack } from '../utils/gestureMachine';
import { hapticSelection } from '../utils/haptics';

const { width: SCREEN_W } = Dimensions.get('window');

/**
 * Thin affordance layer around the native back-swipe gesture. Does NOT drive
 * navigation — native-stack handles that. Emits:
 *   - haptic selection when the swipe crosses the hybrid-progress threshold
 *   - progressive edge-shadow visual as the user drags
 */
export function BackEdgeSwipe({ children }: { children: React.ReactNode }) {
  const navigation = useNavigation();
  // Don't activate on screens with nothing to go back to.
  const canGo = navigation.canGoBack();

  const progress = useSharedValue(0);
  const thresholdFired = useSharedValue(false);
  const buf = useVelocityBuffer();
  const currentT = useSharedValue(0);
  useFrameCallback(({ timestamp }) => {
    'worklet';
    currentT.value = timestamp;
  });

  const fireHaptic = React.useCallback(() => {
    hapticSelection();
  }, []);

  const pan = Gesture.Pan()
    .enabled(canGo)
    .activeOffsetX([gestureConfig.axisLockDp, 9999])
    .hitSlop({ left: 0, width: gestureConfig.leftEdgeWidthDp })
    .onBegin(() => {
      'worklet';
      progress.value = 0;
      thresholdFired.value = false;
      buf.value = [];
    })
    .onUpdate((e) => {
      'worklet';
      const dx = Math.max(0, e.translationX);
      const travel = SCREEN_W * gestureConfig.backTravelRatio;
      const p = Math.max(0, Math.min(1, dx / travel));
      progress.value = p;
      pushSample(buf.value, e.translationX, e.translationY, currentT.value);

      if (!thresholdFired.value && p >= gestureConfig.backHybridProgress) {
        thresholdFired.value = true;
        runOnJS(fireHaptic)();
      }
    })
    .onEnd((e) => {
      'worklet';
      pushSample(buf.value, e.translationX, e.translationY, currentT.value);
      const { vx } = sampledVelocity(buf.value, currentT.value);
      const reason = commitForBack({ progress: progress.value, velocity: vx, holdMs: 0 });
      // The native gesture owns navigation; we just animate our edge shadow out.
      if (reason !== 'none') {
        progress.value = withTiming(1, { duration: 120 });
      } else {
        progress.value = withTiming(0, { duration: 160 });
      }
    });

  const edgeShadowStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.6,
    width: 12 + progress.value * 24,
  }));

  if (!canGo) {
    return <>{children}</>;
  }

  return (
    <View style={{ flex: 1 }}>
      <GestureDetector gesture={pan}>
        <View style={styles.edgeCatch} collapsable={false} />
      </GestureDetector>
      <View style={{ flex: 1 }}>{children}</View>
      <Animated.View pointerEvents="none" style={[styles.edgeShadow, edgeShadowStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  edgeCatch: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: gestureConfig.leftEdgeWidthDp,
    zIndex: 100,
  },
  edgeShadow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.18)',
    zIndex: 99,
  },
});
