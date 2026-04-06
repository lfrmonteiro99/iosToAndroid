import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

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
}

const ACTION_WIDTH = 74;
const SPRING_CONFIG = { damping: 20, stiffness: 300 };

export function CupertinoSwipeableRow({
  children,
  trailingActions = [],
  leadingActions = [],
}: CupertinoSwipeableRowProps) {
  const translateX = useSharedValue(0);
  const contextX = useSharedValue(0);

  const maxTrailing = trailingActions.length * ACTION_WIDTH;
  const maxLeading = leadingActions.length * ACTION_WIDTH;

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onStart(() => {
      contextX.value = translateX.value;
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
      const velocity = e.velocityX;
      // Decide snap position
      if (velocity < -500 && trailingActions.length > 0) {
        translateX.value = withSpring(-maxTrailing, SPRING_CONFIG);
        runOnJS(triggerHaptic)();
      } else if (velocity > 500 && leadingActions.length > 0) {
        translateX.value = withSpring(maxLeading, SPRING_CONFIG);
        runOnJS(triggerHaptic)();
      } else if (translateX.value < -maxTrailing / 2) {
        translateX.value = withSpring(-maxTrailing, SPRING_CONFIG);
        runOnJS(triggerHaptic)();
      } else if (translateX.value > maxLeading / 2) {
        translateX.value = withSpring(maxLeading, SPRING_CONFIG);
        runOnJS(triggerHaptic)();
      } else {
        translateX.value = withSpring(0, SPRING_CONFIG);
      }
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handleActionPress = (action: SwipeAction) => {
    translateX.value = withSpring(0, SPRING_CONFIG);
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
              <Text style={styles.actionText}>{action.label}</Text>
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
              <Text style={styles.actionText}>{action.label}</Text>
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
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    backgroundColor: 'transparent',
  },
});
