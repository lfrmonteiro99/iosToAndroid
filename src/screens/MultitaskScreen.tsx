import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Image,
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
const CARD_WIDTH = 260;
const CARD_HEIGHT = 380;
const CARD_BORDER_RADIUS = 20;
const CARD_OVERLAP = -30; // negative margin for iOS-style overlap

// Gradient pairs derived from name hash
const GRADIENT_PAIRS = [
  ['#1a1a2e', '#16213e'],
  ['#0f3460', '#1a1a40'],
  ['#1b262c', '#0f4c75'],
  ['#2d132c', '#1a1a2e'],
  ['#1b1b2f', '#162447'],
  ['#0a192f', '#112240'],
  ['#1c1c3c', '#2a1454'],
  ['#0d1b2a', '#1b263b'],
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ---------------------------------------------------------------------------
// RecentAppCard
// ---------------------------------------------------------------------------

interface RecentAppCardProps {
  app: InstalledApp;
  onSwipeUp: () => void;
  onTap: () => void;
}

function RecentAppCard({ app, onSwipeUp, onTap }: RecentAppCardProps) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  const gradientIndex = hashName(app.name) % GRADIENT_PAIRS.length;
  const [bgTop, bgBottom] = GRADIENT_PAIRS[gradientIndex];

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
          {/* Card background with gradient-like effect */}
          <View style={[styles.cardBackground, { backgroundColor: bgBottom }]}>
            <View style={[styles.cardGradientTop, { backgroundColor: bgTop }]} />

            {/* Centered app icon */}
            <View style={styles.cardIconContainer}>
              {app.icon ? (
                <Image
                  source={{ uri: app.icon }}
                  style={styles.cardIcon}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.cardIconFallback}>
                  <Ionicons name="apps" size={40} color="rgba(255,255,255,0.5)" />
                </View>
              )}
            </View>

            {/* App name on card */}
            <Text style={styles.cardAppName} numberOfLines={1}>
              {app.name}
            </Text>
          </View>

          {/* Swipe-up hint */}
          <View style={styles.dismissHint}>
            <View style={styles.dismissBar} />
          </View>
        </Pressable>

        {/* App info below card */}
        <View style={styles.appInfo}>
          {app.icon ? (
            <Image source={{ uri: app.icon }} style={styles.appInfoIcon} resizeMode="contain" />
          ) : (
            <View style={styles.appInfoIconFallback}>
              <Ionicons name="apps" size={14} color="#fff" />
            </View>
          )}
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
  const { apps, recentPackages } = useApps();

  // Build recents list: prefer actual tracked recents, fall back to sorted-by-name
  const initialRecents = useMemo(() => {
    if (recentPackages.length > 0) {
      return recentPackages
        .map(pkg => apps.find(a => a.packageName === pkg))
        .filter(Boolean) as InstalledApp[];
    }
    // Fallback: sort by name, take first 8
    return [...apps]
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [apps, recentPackages]);

  const [recents, setRecents] = useState<InstalledApp[]>(initialRecents);

  const handleDismiss = useCallback((pkg: string) => {
    setRecents((prev) => prev.filter((a) => a.packageName !== pkg));
  }, []);

  const handleClearAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRecents([]);
  }, []);

  const handleTap = useCallback((app: InstalledApp) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.goBack();
  }, [navigation]);

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <BlurView intensity={60} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />

      {/* Tap backdrop to close */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => navigation.goBack()}
        accessibilityLabel="Close multitasking"
      />

      {/* Header */}
      <View style={[styles.header, { marginTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Recents</Text>
        {recents.length > 0 && (
          <Pressable onPress={handleClearAll} style={styles.clearAllButton}>
            <Text style={styles.clearAllText}>Clear All</Text>
          </Pressable>
        )}
      </View>

      {recents.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="apps-outline" size={56} color="rgba(255,255,255,0.3)" />
          <Text style={styles.emptyTitle}>No Recent Apps</Text>
          <Text style={styles.emptySubtitle}>Apps you use will appear here</Text>
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
          snapToInterval={CARD_WIDTH + CARD_OVERLAP + 20}
          snapToAlignment="center"
        >
          {recents.map((app) => (
            <RecentAppCard
              key={app.packageName}
              app={app}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    zIndex: 2,
    paddingHorizontal: 24,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  clearAllButton: {
    position: 'absolute',
    right: 24,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  clearAllText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500',
  },

  scrollContent: {
    paddingHorizontal: 24,
    alignItems: 'flex-end',
  },

  cardWrapper: {
    alignItems: 'center',
    width: CARD_WIDTH,
    marginRight: CARD_OVERLAP + 20,
  },

  cardPressable: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: CARD_BORDER_RADIUS,
    overflow: 'hidden',
    position: 'relative',
  },

  cardBackground: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardGradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    borderTopLeftRadius: CARD_BORDER_RADIUS,
    borderTopRightRadius: CARD_BORDER_RADIUS,
  },

  cardIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    // Subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },

  cardIcon: {
    width: 80,
    height: 80,
    borderRadius: 18,
  },

  cardIconFallback: {
    width: 80,
    height: 80,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },

  cardAppName: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: -0.3,
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
  appInfoIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
  },
  appInfoIconFallback: {
    width: 28,
    height: 28,
    borderRadius: 7,
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
    gap: 8,
  },
  emptyTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 18,
    fontWeight: '500',
    marginTop: 4,
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    fontWeight: '400',
  },
});
