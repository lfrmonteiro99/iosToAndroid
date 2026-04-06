import React, { useEffect } from 'react';
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
  const segmentWidth = useSharedValue(0);

  useEffect(() => {
    if (segmentWidth.value > 0) {
      translateX.value = withSpring(selectedIndex * segmentWidth.value, {
        damping: 20,
        stiffness: 300,
      });
    }
  }, [selectedIndex, segmentWidth, translateX]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    const sWidth = width / values.length;
    segmentWidth.value = sWidth;
    translateX.value = selectedIndex * sWidth;
  };

  const sliderStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: segmentWidth.value,
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
