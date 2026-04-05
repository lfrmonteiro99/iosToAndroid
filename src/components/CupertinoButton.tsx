import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

type ButtonVariant = 'filled' | 'tinted' | 'plain';

interface CupertinoButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  destructive?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function CupertinoButton({
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

  const getContainerStyle = (): ViewStyle => {
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
          backgroundColor: destructive
            ? 'rgba(255, 59, 48, 0.15)'
            : 'rgba(0, 122, 255, 0.15)',
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
  };

  const getTextStyle = (): TextStyle => {
    switch (variant) {
      case 'filled':
        return { color: disabled ? colors.secondaryLabel : '#FFFFFF' };
      case 'tinted':
        return { color: disabled ? colors.secondaryLabel : baseColor };
      case 'plain':
        return { color: disabled ? colors.secondaryLabel : baseColor };
    }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        getContainerStyle(),
        { opacity: pressed ? 0.6 : 1 },
        style,
      ]}
    >
      <Text
        style={[
          typography.headline,
          styles.text,
          getTextStyle(),
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    textAlign: 'center',
  },
});
