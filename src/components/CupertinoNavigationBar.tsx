import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';

interface CupertinoNavigationBarProps {
  title: string;
  largeTitle?: boolean;
  leftButton?: React.ReactNode;
  rightButton?: React.ReactNode;
  children?: React.ReactNode;
  contentContainerStyle?: ViewStyle;
}

const LARGE_TITLE_HEIGHT = 52;
const COLLAPSE_THRESHOLD = LARGE_TITLE_HEIGHT;

export function CupertinoNavigationBar({
  title,
  largeTitle = true,
  leftButton,
  rightButton,
  children,
  contentContainerStyle,
}: CupertinoNavigationBarProps) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Large title opacity: fades out as you scroll
  const largeTitleStyle = useAnimatedStyle(() => {
    if (!largeTitle) return {};
    const opacity = interpolate(
      scrollY.value,
      [0, COLLAPSE_THRESHOLD * 0.6, COLLAPSE_THRESHOLD],
      [1, 0.5, 0],
      Extrapolation.CLAMP,
    );
    const translateY = interpolate(
      scrollY.value,
      [0, COLLAPSE_THRESHOLD],
      [0, -10],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ translateY }] };
  });

  // Inline title opacity: fades in when large title collapses
  const inlineTitleStyle = useAnimatedStyle(() => {
    if (!largeTitle) return { opacity: 1 };
    const opacity = interpolate(
      scrollY.value,
      [COLLAPSE_THRESHOLD * 0.7, COLLAPSE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // Large title container height collapses
  const largeTitleContainerStyle = useAnimatedStyle(() => {
    if (!largeTitle) return { height: 0 };
    const height = interpolate(
      scrollY.value,
      [0, COLLAPSE_THRESHOLD],
      [LARGE_TITLE_HEIGHT, 0],
      Extrapolation.CLAMP,
    );
    return { height, overflow: 'hidden' as const };
  });

  // If no children, render static (non-scrollable) version
  if (!children) {
    return (
      <View>
        <BlurView
          intensity={80}
          tint={theme.dark ? 'dark' : 'light'}
          experimentalBlurMethod="dimezisBlurView"
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
                style={[typography.headline, styles.inlineTitle, { color: colors.label }]}
                numberOfLines={1}
              >
                {title}
              </Text>
            )}
            <View style={styles.rightSlot}>{rightButton}</View>
          </View>
        </BlurView>
        {largeTitle && (
          <View style={[styles.largeTitleContainer, { backgroundColor: colors.systemGroupedBackground }]}>
            <Text style={[typography.largeTitle, { color: colors.label }]}>{title}</Text>
          </View>
        )}
      </View>
    );
  }

  // Scrollable version with collapsing large title
  return (
    <View style={styles.flex}>
      {/* Scrollable content */}
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={contentContainerStyle}
      >
        {/* Spacer for the nav bar + large title */}
        <View style={{ height: insets.top + 44 + (largeTitle ? LARGE_TITLE_HEIGHT : 0) }} />
        {children}
      </Animated.ScrollView>

      {/* Fixed nav bar overlay */}
      <View style={[styles.fixedBar, { top: 0 }]}>
        <BlurView
          intensity={80}
          tint={theme.dark ? 'dark' : 'light'}
          experimentalBlurMethod="dimezisBlurView"
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
            <Animated.Text
              style={[typography.headline, styles.inlineTitle, { color: colors.label }, inlineTitleStyle]}
              numberOfLines={1}
            >
              {title}
            </Animated.Text>
            <View style={styles.rightSlot}>{rightButton}</View>
          </View>
        </BlurView>

        {/* Collapsing large title */}
        {largeTitle && (
          <Animated.View
            style={[
              styles.largeTitleContainer,
              { backgroundColor: colors.systemGroupedBackground },
              largeTitleContainerStyle,
            ]}
          >
            <Animated.Text style={[typography.largeTitle, { color: colors.label }, largeTitleStyle]}>
              {title}
            </Animated.Text>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  bar: {
    width: '100%',
  },
  fixedBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
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
    justifyContent: 'center',
    paddingTop: 4,
    paddingBottom: 8,
  },
});
