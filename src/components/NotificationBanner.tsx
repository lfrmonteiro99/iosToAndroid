import React, { useEffect, useCallback } from 'react';
import { View, Text, Image, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';

export interface BannerNotification {
  id: string;
  appName: string;
  appIcon?: string; // base64 URI for the app icon (square, like iOS)
  iconName?: string; // Ionicons fallback name
  iconColor?: string; // Ionicons fallback bg color
  title: string;
  body: string;
  onPress?: () => void;
}

interface Props {
  notification: BannerNotification | null;
  onDismiss: () => void;
}

export function NotificationBanner({ notification, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const { theme, typography } = useTheme();
  const { colors } = theme;

  const translateY = useSharedValue(-150);
  const scale = useSharedValue(0.95);
  const opacity = useSharedValue(1);

  const dismiss = useCallback(() => {
    translateY.value = withTiming(-150, { duration: 200 });
    scale.value = withTiming(0.95, { duration: 200 });
    opacity.value = withTiming(0, { duration: 200 });
    setTimeout(onDismiss, 250);
  }, [onDismiss, translateY, scale, opacity]);

  // Show animation
  useEffect(() => {
    if (notification) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      opacity.value = 1;
      translateY.value = withSpring(0, { damping: 22, stiffness: 350, mass: 0.8 });
      scale.value = withSpring(1, { damping: 22, stiffness: 350 });

      // Auto-dismiss after 5s (iOS style)
      const timer = setTimeout(dismiss, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification, translateY, scale, opacity, dismiss]);

  // Swipe UP to dismiss (iOS gesture)
  const swipeGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onUpdate((e) => {
      // Only allow upward swipe (negative Y)
      if (e.translationY < 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY < -40 || e.velocityY < -300) {
        // Dismiss
        translateY.value = withTiming(-150, { duration: 200 });
        scale.value = withTiming(0.95, { duration: 200 });
        opacity.value = withTiming(0, { duration: 200 });
        runOnJS(onDismiss)();
      } else {
        // Snap back
        translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  // Tap gesture
  const tapGesture = Gesture.Tap().onEnd(() => {
    if (notification?.onPress) {
      runOnJS(notification.onPress)();
    }
    runOnJS(dismiss)();
  });

  const composed = Gesture.Race(swipeGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  if (!notification) return null;

  const hasAppIcon = !!notification.appIcon;

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          styles.container,
          { top: insets.top + 4 },
          animatedStyle,
        ]}
        accessibilityRole="alert"
        accessibilityLabel={`${notification.appName}: ${notification.title}. ${notification.body}`}
      >
        <BlurView
          intensity={95}
          tint={theme.dark ? 'dark' : 'light'}
          experimentalBlurMethod="dimezisBlurView"
          style={styles.blur}
        >
          <View style={styles.content}>
            {/* App icon — iOS uses rounded square, not circle */}
            {hasAppIcon ? (
              <Image
                source={{ uri: notification.appIcon }}
                style={styles.appIcon}
              />
            ) : (
              <View style={[styles.appIcon, { backgroundColor: notification.iconColor || colors.systemBlue }]}>
                <Ionicons
                  name={(notification.iconName || 'notifications') as any} // eslint-disable-line @typescript-eslint/no-explicit-any
                  size={16}
                  color="#FFFFFF"
                />
              </View>
            )}

            {/* Text content */}
            <View style={styles.textArea}>
              {/* First line: app name + "now" */}
              <View style={styles.headerRow}>
                <Text
                  style={[typography.caption1, { color: colors.secondaryLabel, fontWeight: '500' }]}
                  numberOfLines={1}
                >
                  {notification.appName}
                </Text>
                <Text style={[typography.caption1, { color: colors.tertiaryLabel }]}>
                  now
                </Text>
              </View>

              {/* Second line: title (contact name) — bold */}
              <Text
                style={[typography.subhead, { color: colors.label, fontWeight: '600', marginTop: 1 }]}
                numberOfLines={1}
              >
                {notification.title}
              </Text>

              {/* Third line: body (message preview) */}
              <Text
                style={[typography.subhead, { color: colors.label, fontWeight: '400', marginTop: 1 }]}
                numberOfLines={2}
              >
                {notification.body}
              </Text>
            </View>
          </View>
        </BlurView>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 8,
    right: 8,
    zIndex: 9999,
    // iOS-style shadow
    ...Platform.select({
      android: { elevation: 12 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
    }),
  },
  blur: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    paddingRight: 16,
    gap: 10,
  },
  appIcon: {
    width: 36,
    height: 36,
    borderRadius: 8, // iOS app icon squircle at small size
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  textArea: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
