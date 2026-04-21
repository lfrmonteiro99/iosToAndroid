import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { gestureConfig } from '../utils/gestureConfig';
import { useVelocityBuffer, pushSample, sampledVelocity } from '../utils/gestureVelocity';
import { commitForNC } from '../utils/gestureMachine';
import { settle, useGestureReduceMotion } from '../utils/useGestureReduceMotion';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Zone {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface Props {
  zone: Zone;
  onCommit: () => void;
}

export function NotificationCenterOverlay({ zone, onCommit }: Props) {
  const reduceMotion = useGestureReduceMotion();
  const reduceMotionShared = useSharedValue(reduceMotion);
  useEffect(() => {
    reduceMotionShared.value = reduceMotion;
  }, [reduceMotion, reduceMotionShared]);

  const panelProgress = useSharedValue(0);
  const buf = useVelocityBuffer();
  const startedInZone = useSharedValue(false);
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
      const reason = commitForNC({ progress, velocity: vy, holdMs: 0 });
      if (reason !== 'none') {
        panelProgress.value = settle(1, 'mediumSettle', reduceMotionShared.value);
        runOnJS(onCommit)();
      } else {
        panelProgress.value = settle(0, 'fastSettle', reduceMotionShared.value);
      }
    });

  const sheetStyle = useAnimatedStyle(() => {
    'worklet';
    const translateY = -SCREEN_HEIGHT * (1 - panelProgress.value);
    return {
      transform: [{ translateY }],
    };
  });

  const backdropStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: panelProgress.value * 0.5,
    };
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
        style={[styles.sheet, sheetStyle]}
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.handle} />
        <Text style={styles.title}>Notification Center</Text>
        <View style={styles.notifRow}>
          <View style={styles.notifBar} />
          <View style={[styles.notifBar, { opacity: 0.6 }]} />
          <View style={[styles.notifBar, { opacity: 0.4 }]} />
        </View>
      </Animated.View>

      {/* Activation zone — intercepts touches in the top-left strip; hidden from TalkBack */}
      <View
        style={[
          styles.activationZone,
          {
            top: zone.top,
            left: zone.left,
            width: zoneWidth,
            height: zoneHeight,
          },
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
    height: SCREEN_HEIGHT * 0.65,
    backgroundColor: 'rgba(28,28,30,0.92)',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    alignItems: 'center',
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 24,
  },
  notifRow: {
    width: '85%',
    gap: 10,
  },
  notifBar: {
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  activationZone: {
    position: 'absolute',
  },
});
