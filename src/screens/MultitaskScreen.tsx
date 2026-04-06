import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  StatusBar,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

import { useApps, InstalledApp } from '../store/AppsStore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = 280;
const CARD_HEIGHT = 400;
const CARD_BORDER_RADIUS = 20;

// Placeholder screenshot colors — one per slot
const SCREENSHOT_COLORS = [
  '#1C3A5E',
  '#3D1C5E',
  '#1C5E3A',
  '#5E3D1C',
  '#1C4D5E',
];

// ---------------------------------------------------------------------------
// RecentAppCard
// ---------------------------------------------------------------------------

interface RecentAppCardProps {
  app: InstalledApp;
  color: string;
  onSwipeUp: () => void;
  onTap: () => void;
}

function RecentAppCard({ app, color, onSwipeUp, onTap }: RecentAppCardProps) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  const dismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSwipeUp();
  }, [onSwipeUp]);

  const swipeGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onUpdate((e) => {
      if (e.translationY < 0) {
        translateY.value = e.translationY;
        opacity.value = Math.max(0, 1 + e.translationY / (CARD_HEIGHT * 0.6));
      }
    })
    .onEnd((e) => {
      if (e.translationY < -80 || e.velocityY < -500) {
        translateY.value = withTiming(-SCREEN_HEIGHT, { duration: 300 });
        opacity.value = withTiming(0, { duration: 300 }, () => {
          runOnJS(dismiss)();
        });
      } else {
        translateY.value = withTiming(0, { duration: 250 });
        opacity.value = withTiming(1, { duration: 250 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={swipeGesture}>
      <Animated.View style={[styles.cardWrapper, animatedStyle]}>
        <Pressable onPress={onTap} style={styles.cardPressable}>
          {/* Screenshot placeholder */}
          <View style={[styles.screenshot, { backgroundColor: color }]}>
            <Text style={styles.screenshotLabel} numberOfLines={1}>
              {app.name}
            </Text>
            <Ionicons name="phone-portrait-outline" size={48} color="rgba(255,255,255,0.15)" />
          </View>

          {/* Swipe-up hint */}
          <View style={styles.dismissHint}>
            <View style={styles.dismissBar} />
          </View>
        </Pressable>

        {/* App info below card */}
        <View style={styles.appInfo}>
          <View style={styles.appIconBadge}>
            <Ionicons name="apps" size={18} color="#fff" />
          </View>
          <Text style={styles.appInfoName} numberOfLines={1}>
            {app.name}
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

// ---------------------------------------------------------------------------
// MultitaskScreen
// ---------------------------------------------------------------------------

export function MultitaskScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { apps } = useApps();

  // Take first 5 non-dock apps as placeholder recents
  const initialRecents = apps.slice(0, 5);
  const [recents, setRecents] = useState<InstalledApp[]>(initialRecents);

  const handleDismiss = useCallback((pkg: string) => {
    setRecents((prev) => prev.filter((a) => a.packageName !== pkg));
  }, []);

  const handleTap = useCallback((app: InstalledApp) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.goBack();
    // In a real launcher this would bring the app to foreground
  }, [navigation]);

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />

      {/* Tap backdrop to close */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => navigation.goBack()}
        accessibilityLabel="Close multitasking"
      />

      {/* Title */}
      <View style={[styles.header, { marginTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Recents</Text>
      </View>

      {recents.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="apps-outline" size={56} color="rgba(255,255,255,0.3)" />
          <Text style={styles.emptyText}>No recent apps</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 16 },
          ]}
          decelerationRate="fast"
          snapToInterval={CARD_WIDTH + 20}
          snapToAlignment="center"
        >
          {recents.map((app, index) => (
            <RecentAppCard
              key={app.packageName}
              app={app}
              color={SCREENSHOT_COLORS[index % SCREENSHOT_COLORS.length]}
              onSwipeUp={() => handleDismiss(app.packageName)}
              onTap={() => handleTap(app)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  header: {
    alignItems: 'center',
    marginBottom: 24,
    zIndex: 2,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },

  scrollContent: {
    paddingHorizontal: 24,
    gap: 20,
    alignItems: 'flex-end',
  },

  cardWrapper: {
    alignItems: 'center',
    width: CARD_WIDTH,
  },

  cardPressable: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: CARD_BORDER_RADIUS,
    overflow: 'hidden',
    position: 'relative',
  },

  screenshot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },

  screenshotLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 22,
    fontWeight: '300',
    letterSpacing: -0.5,
  },

  dismissHint: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  dismissBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },

  appInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
    maxWidth: CARD_WIDTH,
  },
  appIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appInfoName: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 17,
    fontWeight: '400',
  },
});
