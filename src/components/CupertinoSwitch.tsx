import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';
import { AnimationConfig, Shadows } from '../theme/CupertinoTheme';
import { hapticSelection } from '../utils/haptics';
import { useGestureReduceMotion } from '../utils/useGestureReduceMotion';

interface CupertinoSwitchProps {
  value: boolean;
  onValueChange?: (value: boolean) => void;
  trackColor?: { true?: string; false?: string };
  disabled?: boolean;
  /** Identificador de teste opcional (passado ao Pressable raiz). */
  testID?: string;
}

const TRACK_WIDTH = 51;
const TRACK_HEIGHT = 31;
const THUMB_SIZE = 27;
const THUMB_OFFSET = 2;

export function CupertinoSwitch({
  value,
  onValueChange,
  trackColor,
  disabled = false,
  testID,
}: CupertinoSwitchProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  const reduceMotion = useGestureReduceMotion();

  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    const target = value ? 1 : 0;
    progress.value = reduceMotion
      ? withTiming(target, { duration: 150 })
      : withSpring(target, AnimationConfig.defaultSpring);
    // Shared values are stable refs; reduceMotion is a reactive dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduceMotion]);

  const onColor = trackColor?.true ?? colors.systemGreen;
  const offColor = trackColor?.false ?? colors.systemGray4;

  const trackAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [offColor, onColor]
    ),
  }));

  const thumbAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          progress.value * (TRACK_WIDTH - THUMB_SIZE - THUMB_OFFSET * 2),
      },
    ],
  }));

  const handlePress = () => {
    if (!disabled) {
      hapticSelection().catch(() => {});
      onValueChange?.(!value);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={value ? 'On' : 'Off'}
      testID={testID}
    >
      <Animated.View
        style={[
          styles.track,
          trackAnimatedStyle,
          disabled && { opacity: 0.5 },
        ]}
      >
        <Animated.View style={[styles.thumb, thumbAnimatedStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    justifyContent: 'center',
    paddingHorizontal: THUMB_OFFSET,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#FFFFFF',
    ...Shadows.thumb,
  },
});
