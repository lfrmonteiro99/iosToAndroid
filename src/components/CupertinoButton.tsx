import React, { useMemo } from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { ImpactFeedbackStyle } from 'expo-haptics';
import { hapticImpact } from '../utils/haptics';
import { useTheme } from '../theme/ThemeContext';

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

  return (
    <Pressable
      onPress={() => {
        hapticImpact(ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        containerStyle,
        { opacity: pressed ? 0.6 : 1 },
        style,
      ]}
    >
      <Text style={[typography.headline, styles.text, textStyle]}>
        {title}
      </Text>
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
