import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';

interface CupertinoNavigationBarProps {
  title: string;
  largeTitle?: boolean;
  leftButton?: React.ReactNode;
  rightButton?: React.ReactNode;
}

export function CupertinoNavigationBar({
  title,
  largeTitle = true,
  leftButton,
  rightButton,
}: CupertinoNavigationBarProps) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  return (
    <View>
      {/* Blur background bar */}
      <BlurView
        intensity={80}
        tint={theme.dark ? 'dark' : 'light'}
        style={[
          styles.bar,
          {
            paddingTop: insets.top,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.separator,
          },
        ]}
      >
        <View style={styles.barContent}>
          <View style={styles.leftSlot}>{leftButton}</View>
          {!largeTitle && (
            <Text
              style={[
                typography.headline,
                styles.inlineTitle,
                { color: colors.label },
              ]}
              numberOfLines={1}
            >
              {title}
            </Text>
          )}
          <View style={styles.rightSlot}>{rightButton}</View>
        </View>
      </BlurView>

      {/* Large title below bar */}
      {largeTitle && (
        <View
          style={[
            styles.largeTitleContainer,
            { backgroundColor: colors.systemGroupedBackground },
          ]}
        >
          <Text
            style={[
              typography.largeTitle,
              { color: colors.label },
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: '100%',
  },
  barContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    paddingHorizontal: 16,
  },
  leftSlot: {
    minWidth: 60,
    alignItems: 'flex-start',
  },
  rightSlot: {
    minWidth: 60,
    alignItems: 'flex-end',
  },
  inlineTitle: {
    flex: 1,
    textAlign: 'center',
  },
  largeTitleContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
});
