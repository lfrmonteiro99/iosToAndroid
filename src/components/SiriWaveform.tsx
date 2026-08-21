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
import { useGestureReduceMotion } from '../utils/useGestureReduceMotion';

// Idle (not listening) visual constants — the bars sit still, short and dim.
export const SIRI_WAVEFORM_IDLE_SCALE = 0.4;
export const SIRI_WAVEFORM_IDLE_OPACITY = 0.35;
// Peak of the listening loop.
export const SIRI_WAVEFORM_ACTIVE_SCALE = 1;
export const SIRI_WAVEFORM_ACTIVE_OPACITY = 1;

export const SIRI_WAVEFORM_BAR_COUNT = 5;
// Per-bar duration, staggered so the bars don't pulse in lockstep.
const BAR_DURATIONS = [520, 640, 760, 600, 480];

interface SiriWaveformBarProps {
  index: number;
  listening: boolean;
  reduceMotion: boolean;
  color: string;
}

function SiriWaveformBar({ index, listening, reduceMotion, color }: SiriWaveformBarProps) {
  const scale = useSharedValue(SIRI_WAVEFORM_IDLE_SCALE);
  const opacity = useSharedValue(SIRI_WAVEFORM_IDLE_OPACITY);

  useEffect(() => {
    if (!listening) {
      // Stop the loop and settle back to the idle visual state.
      cancelAnimation(scale);
      cancelAnimation(opacity);
      scale.value = SIRI_WAVEFORM_IDLE_SCALE;
      opacity.value = SIRI_WAVEFORM_IDLE_OPACITY;
      return;
    }

    if (reduceMotion) {
      // Accessibility: no loop, just show the active (steady) state.
      cancelAnimation(scale);
      cancelAnimation(opacity);
      scale.value = SIRI_WAVEFORM_ACTIVE_SCALE;
      opacity.value = SIRI_WAVEFORM_ACTIVE_OPACITY;
      return;
    }

    const duration = BAR_DURATIONS[index % BAR_DURATIONS.length];
    scale.value = withRepeat(
      withTiming(SIRI_WAVEFORM_ACTIVE_SCALE, {
        duration,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
    opacity.value = withRepeat(
      withTiming(SIRI_WAVEFORM_ACTIVE_OPACITY, {
        duration,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );

    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [listening, reduceMotion, index, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scaleY: scale.value }],
  }));

  return (
    <Animated.View
      testID={`siri-waveform-bar-${index}`}
      style={[styles.bar, { backgroundColor: color }, animatedStyle]}
    />
  );
}

export interface SiriWaveformProps {
  listening: boolean;
}

export function SiriWaveform({ listening }: SiriWaveformProps) {
  const { theme } = useTheme();
  const reduceMotion = useGestureReduceMotion();
  const color = theme.colors.systemBlue;

  return (
    <View
      testID="siri-waveform"
      accessibilityRole="progressbar"
      accessibilityLabel={listening ? 'Listening' : 'Not listening'}
      style={styles.container}
    >
      {Array.from({ length: SIRI_WAVEFORM_BAR_COUNT }, (_, index) => (
        <SiriWaveformBar
          key={index}
          index={index}
          listening={listening}
          reduceMotion={reduceMotion}
          color={color}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    gap: 5,
  },
  bar: {
    width: 4,
    height: 36,
    borderRadius: 2,
  },
});
