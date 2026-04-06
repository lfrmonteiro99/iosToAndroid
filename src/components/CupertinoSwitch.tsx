import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolateColor,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';

interface CupertinoSwitchProps {
  value: boolean;
  onValueChange?: (value: boolean) => void;
  trackColor?: { true?: string; false?: string };
  disabled?: boolean;
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
}: CupertinoSwitchProps) {
  const { theme } = useTheme();
  const { colors } = theme;

  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, {
      damping: 20,
      stiffness: 300,
    });
  }, [value, progress]);

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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onValueChange?.(!value);
    }
  };

  return (
    <Pressable onPress={handlePress} disabled={disabled}>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
});
