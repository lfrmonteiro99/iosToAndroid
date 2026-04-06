import React from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  useSharedValue,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';

interface CupertinoSliderProps {
  value: number;
  onValueChange: (value: number) => void;
  minimumValue?: number;
  maximumValue?: number;
  minimumTrackColor?: string;
  maximumTrackColor?: string;
  disabled?: boolean;
}

const THUMB_SIZE = 28;
const TRACK_HEIGHT = 4;

export function CupertinoSlider({
  value,
  onValueChange,
  minimumValue = 0,
  maximumValue = 1,
  minimumTrackColor,
  maximumTrackColor,
  disabled = false,
}: CupertinoSliderProps) {
  const { theme } = useTheme();
  const { colors } = theme;

  const trackWidth = useSharedValue(0);
  const range = maximumValue - minimumValue;
  const normalizedValue = (value - minimumValue) / range;

  const minColor = minimumTrackColor ?? colors.systemBlue;
  const maxColor = maximumTrackColor ?? colors.systemGray4;

  const handleLayout = (e: LayoutChangeEvent) => {
    trackWidth.value = e.nativeEvent.layout.width;
  };

  const updateValue = (x: number) => {
    const w = trackWidth.value;
    if (w <= 0) return;
    const clamped = Math.max(0, Math.min(x, w));
    const newValue = minimumValue + (clamped / w) * range;
    onValueChange(Math.round(newValue * 100) / 100);
  };

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .onBegin((e) => {
      runOnJS(triggerHaptic)();
      runOnJS(updateValue)(e.x);
    })
    .onChange((e) => {
      runOnJS(updateValue)(e.x);
    });

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .onEnd((e) => {
      runOnJS(triggerHaptic)();
      runOnJS(updateValue)(e.x);
    });

  const composed = Gesture.Race(pan, tap);

  return (
    <GestureDetector gesture={composed}>
      <View
        style={[styles.container, disabled && { opacity: 0.5 }]}
        onLayout={handleLayout}
      >
        {/* Background track */}
        <View style={[styles.track, { backgroundColor: maxColor }]} />

        {/* Filled track */}
        <Animated.View
          style={[
            styles.filledTrack,
            { backgroundColor: minColor, width: `${normalizedValue * 100}%` },
          ]}
        />

        {/* Thumb */}
        <View
          style={[
            styles.thumb,
            {
              left: `${normalizedValue * 100}%`,
              marginLeft: -(THUMB_SIZE / 2),
            },
          ]}
        >
          <View style={styles.thumbInner} />
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    height: THUMB_SIZE + 8,
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    width: '100%',
  },
  filledTrack: {
    position: 'absolute',
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    top: (THUMB_SIZE + 8 - TRACK_HEIGHT) / 2,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    top: 4,
  },
  thumbInner: {
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
