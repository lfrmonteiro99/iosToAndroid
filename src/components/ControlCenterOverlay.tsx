import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { gestureConfig } from '../utils/gestureConfig';
import { useVelocityBuffer, pushSample, sampledVelocity } from '../utils/gestureVelocity';
import { commitForPanel } from '../utils/gestureMachine';

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

export function ControlCenterOverlay({ zone, onCommit }: Props) {
  const panelProgress = useSharedValue(0);
  const buf = useVelocityBuffer();
  const startedInZone = useSharedValue(false);
  // Wall-clock timestamp updated per gesture event
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
      currentT.value = e.absoluteY; // approximate; overwritten in onUpdate
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
        panelProgress.value = withSpring(0, gestureConfig.spring.fastSettle);
        return;
      }
      currentT.value = Date.now();
      pushSample(buf.value, e.translationX, e.translationY, currentT.value);
      const { vy } = sampledVelocity(buf.value, currentT.value);
      const progress = panelProgress.value;
      const reason = commitForPanel({ progress, velocity: vy, holdMs: 0 });
      if (reason !== 'none') {
        panelProgress.value = withSpring(1, gestureConfig.spring.mediumSettle);
        runOnJS(onCommit)();
      } else {
        panelProgress.value = withSpring(0, gestureConfig.spring.fastSettle);
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

      {/* Sliding preview sheet */}
      <Animated.View style={[styles.sheet, sheetStyle]} pointerEvents="none">
        <View style={styles.handle} />
        <Text style={styles.title}>Control Center</Text>
        <View style={styles.tileRow}>
          <View style={styles.tile} />
          <View style={styles.tile} />
          <View style={styles.tile} />
          <View style={styles.tile} />
        </View>
      </Animated.View>

      {/* Activation zone — intercepts touches in the top-right corner */}
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
    height: SCREEN_HEIGHT * 0.55,
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
  tileRow: {
    flexDirection: 'row',
    gap: 12,
  },
  tile: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  activationZone: {
    position: 'absolute',
  },
});
