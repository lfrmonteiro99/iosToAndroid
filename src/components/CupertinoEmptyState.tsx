import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { CupertinoButton } from './CupertinoButton';

interface CupertinoEmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  iconColor?: string;
}

export function CupertinoEmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  iconColor,
}: CupertinoEmptyStateProps) {
  const { theme, typography } = useTheme();
  const { colors } = theme;

  return (
    <View style={styles.container}>
      <Ionicons
        name={icon}
        size={56}
        color={iconColor ?? colors.systemGray3}
        accessibilityElementsHidden
      />
      <Text
        style={[typography.headline, { color: colors.label, marginTop: 16 }]}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {message ? (
        <Text
          style={[
            typography.body,
            {
              color: colors.secondaryLabel,
              textAlign: 'center',
              marginTop: 8,
              marginHorizontal: 32,
              lineHeight: 20,
            },
          ]}
        >
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <CupertinoButton
          title={actionLabel}
          onPress={onAction}
          style={{ marginTop: 20 }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 60,
    paddingHorizontal: 16,
  },
});
