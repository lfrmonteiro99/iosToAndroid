import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';

interface CupertinoProgressBarProps {
  progress: number; // 0..1
  trackColor?: string;
  progressColor?: string;
  style?: ViewStyle;
}

const TRACK_HEIGHT = 4;

export function CupertinoProgressBar({
  progress,
  trackColor,
  progressColor,
  style,
}: CupertinoProgressBarProps) {
  const { theme } = useTheme();
  const { colors } = theme;

  const animatedProgress = useSharedValue(progress);

  useEffect(() => {
    animatedProgress.value = withTiming(Math.max(0, Math.min(1, progress)), {
      duration: 300,
    });
  }, [progress, animatedProgress]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${animatedProgress.value * 100}%`,
  }));

  return (
    <View
      style={[
        styles.track,
        {
          backgroundColor: trackColor ?? colors.systemGray5,
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.progress,
          {
            backgroundColor: progressColor ?? colors.systemBlue,
          },
          progressStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    overflow: 'hidden',
    width: '100%',
  },
  progress: {
    height: '100%',
    borderRadius: TRACK_HEIGHT / 2,
  },
});
