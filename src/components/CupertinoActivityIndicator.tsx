import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';

interface CupertinoActivityIndicatorProps {
  size?: 'small' | 'large';
  color?: string;
  animating?: boolean;
}

const PETAL_COUNT = 8;

export function CupertinoActivityIndicator({
  size = 'small',
  color,
  animating = true,
}: CupertinoActivityIndicatorProps) {
  const { theme } = useTheme();
  const indicatorColor = color ?? theme.colors.systemGray;

  const dimension = size === 'large' ? 36 : 20;
  const petalLength = size === 'large' ? 9 : 5;
  const petalWidth = size === 'large' ? 3 : 2;

  const rotation = useSharedValue(0);

  useEffect(() => {
    if (animating) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      cancelAnimation(rotation);
    }
    return () => cancelAnimation(rotation);
  }, [animating, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  if (!animating) return null;

  return (
    <Animated.View
      style={[
        { width: dimension, height: dimension },
        animatedStyle,
      ]}
    >
      {Array.from({ length: PETAL_COUNT }).map((_, i) => {
        const angle = (i * 360) / PETAL_COUNT;
        const opacity = 0.25 + (i / PETAL_COUNT) * 0.75;
        return (
          <View
            key={i}
            style={[
              styles.petal,
              {
                width: petalWidth,
                height: petalLength,
                backgroundColor: indicatorColor,
                opacity,
                borderRadius: petalWidth / 2,
                transform: [
                  { translateX: -petalWidth / 2 },
                  { translateY: 0 },
                  { rotate: `${angle}deg` },
                  { translateY: -(dimension / 2 - petalLength / 2 - 1) },
                ],
                left: dimension / 2,
                top: dimension / 2 - petalLength / 2,
              },
            ]}
          />
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  petal: {
    position: 'absolute',
  },
});
