import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';

interface CupertinoSegmentedControlProps {
  values: string[];
  selectedIndex: number;
  onChange?: (index: number) => void;
}

export function CupertinoSegmentedControl({
  values,
  selectedIndex,
  onChange,
}: CupertinoSegmentedControlProps) {
  const { theme, typography, shadows } = useTheme();
  const { colors } = theme;

  const translateX = useSharedValue(0);
  const animatedWidth = useSharedValue(0);
  const [containerWidth, setContainerWidth] = useState(0);

  const segWidth = containerWidth > 0 ? containerWidth / values.length : 0;

  useEffect(() => {
    if (segWidth > 0) {
      animatedWidth.value = segWidth;
      translateX.value = withSpring(selectedIndex * segWidth, {
        damping: 20,
        stiffness: 300,
      });
    }
  }, [selectedIndex, segWidth, translateX, animatedWidth]);

  const handleLayout = (event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  };

  const sliderStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: animatedWidth.value,
  }));

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.systemGray5 },
      ]}
      onLayout={handleLayout}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.slider,
          shadows.small,
          {
            backgroundColor: theme.dark
              ? colors.systemGray3
              : '#FFFFFF',
          },
          sliderStyle,
        ]}
      />
      {values.map((value, index) => (
        <Pressable
          key={value}
          style={styles.segment}
          onPress={() => {
            Haptics.selectionAsync();
            onChange?.(index);
          }}
        >
          <Text
            style={[
              typography.subhead,
              {
                fontWeight: selectedIndex === index ? '600' : '400',
                color: colors.label,
              },
            ]}
          >
            {value}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
    position: 'relative',
    height: 32,
  },
  slider: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    borderRadius: 7,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});
