import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface CupertinoCardProps {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  style?: ViewStyle;
}

export function CupertinoCard({ title, subtitle, children, style }: CupertinoCardProps) {
  const { theme, typography, spacing, borderRadius, shadows } = useTheme();
  const { colors } = theme;

  return (
    <View
      style={[
        styles.container,
        shadows.medium,
        {
          backgroundColor: theme.dark
            ? colors.secondarySystemBackground
            : colors.systemBackground,
          borderRadius: borderRadius.medium,
          padding: spacing.md,
        },
        style,
      ]}
    >
      {title && (
        <Text style={[typography.headline, { color: colors.label, marginBottom: subtitle ? 2 : spacing.sm }]}>
          {title}
        </Text>
      )}
      {subtitle && (
        <Text
          style={[
            typography.subhead,
            { color: colors.secondaryLabel, marginBottom: spacing.sm },
          ]}
        >
          {subtitle}
        </Text>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
