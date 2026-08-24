import React, { useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { hapticImpact } from '../utils/haptics';
import { useTheme } from '../theme/ThemeContext';
import { useMotionIntensity, settle } from '../utils/useGestureReduceMotion';
import { feedbackSettle } from '../theme/springPresets';

export interface SwipeAction {
  label: string;
  color: string;
  icon?: string;
  onPress: () => void;
}

interface CupertinoSwipeableRowProps {
  children: React.ReactNode;
  trailingActions?: SwipeAction[];
  leadingActions?: SwipeAction[];
  isOpen?: boolean;
  onOpen?: () => void;
}

const ACTION_WIDTH = 74;
const SPRING_CONFIG = feedbackSettle;

export function CupertinoSwipeableRow({
  children,
  trailingActions = [],
  leadingActions = [],
  isOpen,
  onOpen,
}: CupertinoSwipeableRowProps) {
  const { typography } = useTheme();
  const motionIntensity = useMotionIntensity();
  const motionIntensityShared = useSharedValue(motionIntensity);
  const translateX = useSharedValue(0);
  const contextX = useSharedValue(0);

  // Sync motionIntensity into shared value so worklets can read it
  useEffect(() => {
    motionIntensityShared.value = motionIntensity;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionIntensity]);

  // Always hold the latest onOpen so gesture doesn't capture a stale ref
  const onOpenRef = useRef(onOpen);
  useEffect(() => { onOpenRef.current = onOpen; }, [onOpen]);

  // Close this row when parent signals another row is now open
  useEffect(() => {
    if (isOpen === false) {
      translateX.value = settle(0, SPRING_CONFIG, motionIntensity);
    }
    // Shared values are stable refs; motionIntensity is a reactive dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, motionIntensity]);

  const maxTrailing = trailingActions.length * ACTION_WIDTH;
  const maxLeading = leadingActions.length * ACTION_WIDTH;

  const triggerHaptic = () => {
    hapticImpact(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const notifyOpen = () => { onOpenRef.current?.(); };

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onStart(() => {
      contextX.value = translateX.value;
      runOnJS(notifyOpen)();
    })
    .onUpdate((e) => {
      const newX = contextX.value + e.translationX;
      // Clamp with rubber-banding
      if (newX < -maxTrailing) {
        translateX.value = -maxTrailing + (newX + maxTrailing) * 0.2;
      } else if (newX > maxLeading) {
        translateX.value = maxLeading + (newX - maxLeading) * 0.2;
      } else {
        translateX.value = newX;
      }
    })
    .onEnd((e) => {
      'worklet';
      const velocity = e.velocityX;
      const rm = motionIntensityShared.value;
      // translateX is a literal dp offset — e.velocityX is already dp/sec.
      // Decide snap position
      if (velocity < -500 && trailingActions.length > 0) {
        translateX.value = settle(-maxTrailing, SPRING_CONFIG, rm, velocity);
        runOnJS(triggerHaptic)();
      } else if (velocity > 500 && leadingActions.length > 0) {
        translateX.value = settle(maxLeading, SPRING_CONFIG, rm, velocity);
        runOnJS(triggerHaptic)();
      } else if (translateX.value < -maxTrailing / 2) {
        translateX.value = settle(-maxTrailing, SPRING_CONFIG, rm, velocity);
        runOnJS(triggerHaptic)();
      } else if (translateX.value > maxLeading / 2) {
        translateX.value = settle(maxLeading, SPRING_CONFIG, rm, velocity);
        runOnJS(triggerHaptic)();
      } else {
        translateX.value = settle(0, SPRING_CONFIG, rm, velocity);
      }
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handleActionPress = (action: SwipeAction) => {
    translateX.value = settle(0, SPRING_CONFIG, motionIntensity);
    action.onPress();
  };

  return (
    <View style={styles.container}>
      {/* Leading actions (left side, revealed when swiping right) */}
      {leadingActions.length > 0 && (
        <View style={[styles.actionsContainer, styles.leadingActions]}>
          {leadingActions.map((action) => (
            <Pressable
              key={action.label}
              style={[styles.action, { backgroundColor: action.color, width: ACTION_WIDTH }]}
              onPress={() => handleActionPress(action)}
            >
              <Text style={[typography.footnote, styles.actionText]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Trailing actions (right side, revealed when swiping left) */}
      {trailingActions.length > 0 && (
        <View style={[styles.actionsContainer, styles.trailingActions]}>
          {trailingActions.map((action) => (
            <Pressable
              key={action.label}
              style={[styles.action, { backgroundColor: action.color, width: ACTION_WIDTH }]}
              onPress={() => handleActionPress(action)}
            >
              <Text style={[typography.footnote, styles.actionText]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Content row */}
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.content, rowStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
  actionsContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  leadingActions: {
    left: 0,
  },
  trailingActions: {
    right: 0,
  },
  action: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  content: {
    backgroundColor: 'transparent',
  },
});
