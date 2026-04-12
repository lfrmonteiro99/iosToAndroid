import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';

// ─── Base Skeleton ─────────────────────────────────────────────────────────

interface CupertinoSkeletonProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function CupertinoSkeleton({
  width,
  height,
  borderRadius = 4,
  style,
}: CupertinoSkeletonProps) {
  const { isDark } = useTheme();
  const opacity = useSharedValue(0.3);

  React.useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.7, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const bgColor = isDark ? '#3A3A3C' : '#D1D1D6';

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: bgColor,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

// ─── SkeletonListRow ───────────────────────────────────────────────────────

export function SkeletonListRow({ style }: { style?: ViewStyle } = {}) {
  return (
    <View style={[skeletonStyles.listRow, style]}>
      <CupertinoSkeleton width={44} height={44} borderRadius={22} />
      <View style={skeletonStyles.listRowLines}>
        <CupertinoSkeleton width="70%" height={14} borderRadius={7} />
        <CupertinoSkeleton width="45%" height={12} borderRadius={6} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

// ─── SkeletonCard ──────────────────────────────────────────────────────────

interface SkeletonCardProps {
  height?: number;
  style?: ViewStyle;
}

export function SkeletonCard({ height = 120, style }: SkeletonCardProps) {
  return (
    <CupertinoSkeleton
      width="100%"
      height={height}
      borderRadius={16}
      style={style}
    />
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const skeletonStyles = StyleSheet.create({
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  listRowLines: {
    flex: 1,
    marginLeft: 12,
  },
});
