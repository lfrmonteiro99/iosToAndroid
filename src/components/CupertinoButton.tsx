import React, { useMemo, useRef, useCallback } from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, TextStyle, GestureResponderEvent } from 'react-native';
import Animated from 'react-native-reanimated';
import { ImpactFeedbackStyle } from 'expo-haptics';
import { hapticImpact } from '../utils/haptics';
import { useTheme } from '../theme/ThemeContext';
import { useCupertinoPress } from '../hooks/useCupertinoPress';

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type ButtonVariant = 'filled' | 'tinted' | 'plain';

interface CupertinoButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  destructive?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export const CupertinoButton = React.memo(function CupertinoButton({
  title,
  onPress,
  variant = 'filled',
  destructive = false,
  disabled = false,
  style,
}: CupertinoButtonProps) {
  const { theme, typography, borderRadius } = useTheme();
  const { colors } = theme;
  const lastPressRef = useRef(0);

  const handlePress = useCallback((_e: GestureResponderEvent) => {
    const now = Date.now();
    if (now - lastPressRef.current < 300) return;
    lastPressRef.current = now;
    onPress?.();
  }, [onPress]);

  const baseColor = destructive ? colors.systemRed : colors.systemBlue;

  const containerStyle = useMemo((): ViewStyle => {
    switch (variant) {
      case 'filled':
        return {
          backgroundColor: disabled ? colors.systemGray4 : baseColor,
          borderRadius: borderRadius.pill,
          paddingVertical: 12,
          paddingHorizontal: 20,
        };
      case 'tinted':
        return {
          backgroundColor: hexToRgba(baseColor, 0.15),
          borderRadius: borderRadius.pill,
          paddingVertical: 12,
          paddingHorizontal: 20,
        };
      case 'plain':
        return {
          paddingVertical: 8,
          paddingHorizontal: 4,
        };
    }
  }, [variant, disabled, baseColor, colors.systemGray4, borderRadius.pill]);

  const textStyle = useMemo((): TextStyle => {
    switch (variant) {
      case 'filled':
        return { color: disabled ? colors.secondaryLabel : '#FFFFFF' };
      case 'tinted':
      case 'plain':
        return { color: disabled ? colors.secondaryLabel : baseColor };
    }
  }, [variant, disabled, baseColor, colors.secondaryLabel]);

  // Shared press-feedback primitive (issue #495): scale 0.96 + opacity 0.40 on
  // press, respecting reduceMotion. Replaces the previous inline
  // `opacity: pressed ? 0.6 : 1`, which was one of six divergent opacity
  // conventions across the app; 0.40 is the §3.2 default for icon/button
  // surfaces. A disabled button must not show pressed feedback.
  const { style: pressStyle, onPressIn, onPressOut } = useCupertinoPress(!disabled);

  return (
    <Pressable
      onPress={(e) => {
        hapticImpact(ImpactFeedbackStyle.Light);
        handlePress(e);
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      style={[styles.base, containerStyle, style]}
    >
      <Animated.View style={pressStyle}>
        <Text style={[typography.headline, styles.text, textStyle]}>
          {title}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    textAlign: 'center',
  },
});
