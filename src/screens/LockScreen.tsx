import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Dimensions,
  Pressable,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { useDevice } from '../store/DeviceStore';
import { useSettings } from '../store/SettingsStore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WALLPAPERS: readonly string[] = [
  '#667eea',
  '#f093fb',
  '#4facfe',
  '#43e97b',
  '#fa709a',
  '#1C1C1E',
];

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SWIPE_THRESHOLD = 100;

function darkenHex(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - Math.round(255 * amount));
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(255 * amount));
  const b = Math.max(0, (num & 0xff) - Math.round(255 * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function formatTime(date: Date, use24Hour: boolean): string {
  if (use24Hour) {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }
  let h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m}`;
}

function formatLargeClock(date: Date, use24Hour: boolean): string {
  if (use24Hour) {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }
  let h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, '0');
  h = h % 12 || 12;
  return `${h}:${m}`;
}

function formatFullDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Fake notifications
// ---------------------------------------------------------------------------

interface FakeNotification {
  id: string;
  app: string;
  iconName: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  time: string;
  preview: string;
}

const FAKE_NOTIFICATIONS: FakeNotification[] = [
  {
    id: '1',
    app: 'Messages',
    iconName: 'chatbubble-ellipses',
    iconColor: '#30D158',
    time: '2m ago',
    preview: 'Hey, are you coming tonight?',
  },
  {
    id: '2',
    app: 'Mail',
    iconName: 'mail',
    iconColor: '#0A84FF',
    time: '14m ago',
    preview: 'Your monthly statement is ready.',
  },
  {
    id: '3',
    app: 'Calendar',
    iconName: 'calendar',
    iconColor: '#FF375F',
    time: '1h ago',
    preview: 'Reminder: Team sync at 3:00 PM',
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function NotificationCard({ item }: { item: FakeNotification }) {
  return (
    <BlurView intensity={40} tint="dark" style={styles.notifCard}>
      <View style={styles.notifHeader}>
        <View style={[styles.notifIconWrap, { backgroundColor: item.iconColor }]}>
          <Ionicons name={item.iconName} size={14} color="#fff" />
        </View>
        <Text style={styles.notifApp}>{item.app}</Text>
        <Text style={styles.notifTime}>{item.time}</Text>
      </View>
      <Text style={styles.notifPreview} numberOfLines={1}>
        {item.preview}
      </Text>
    </BlurView>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export function LockScreen({ navigation }: { navigation: any; route: any }) {
  const insets = useSafeAreaInsets();
  const device = useDevice();
  const { settings } = useSettings();

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Swipe-up animation
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  const handleUnlock = () => {
    navigation.goBack();
  };

  const swipeGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY < 0) {
        // Only track upward swipes
        translateY.value = e.translationY;
        opacity.value = 1 + e.translationY / (SCREEN_HEIGHT * 0.4);
      }
    })
    .onEnd((e) => {
      if (e.translationY < -SWIPE_THRESHOLD) {
        translateY.value = withSpring(-SCREEN_HEIGHT, { damping: 20, stiffness: 200 });
        opacity.value = withTiming(0, { duration: 250 }, () => {
          runOnJS(handleUnlock)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
        opacity.value = withTiming(1, { duration: 200 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const wallpaperColor =
    WALLPAPERS[Math.min(settings.wallpaperIndex, WALLPAPERS.length - 1)] as string;
  const wallpaperDark = darkenHex(wallpaperColor, 0.35);

  const batteryLevel = Math.round(device.battery.level * 100);
  const batteryIconName: keyof typeof Ionicons.glyphMap =
    device.battery.isCharging
      ? 'battery-charging'
      : batteryLevel > 70
      ? 'battery-full'
      : batteryLevel > 35
      ? 'battery-half'
      : 'battery-dead';

  return (
    <GestureDetector gesture={swipeGesture}>
      <Animated.View style={[styles.root, animatedStyle]}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <LinearGradient
          colors={[wallpaperColor, wallpaperDark, '#000000']}
          locations={[0, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* ---------------------------------------------------------------- */}
        {/* Status bar row                                                     */}
        {/* ---------------------------------------------------------------- */}
        <View style={[styles.statusRow, { marginTop: insets.top + 4 }]}>
          <Text style={styles.statusTime}>{formatTime(now, settings.use24Hour)}</Text>
          <View style={styles.statusRight}>
            <Ionicons
              name="lock-closed"
              size={12}
              color="rgba(255,255,255,0.8)"
              style={{ marginRight: 6 }}
            />
            {device.wifi.enabled && (
              <Ionicons
                name="wifi"
                size={14}
                color="rgba(255,255,255,0.8)"
                style={{ marginRight: 6 }}
              />
            )}
            <View style={styles.batteryRow}>
              {device.battery.isCharging && (
                <Ionicons name="flash" size={11} color="rgba(255,255,255,0.85)" />
              )}
              <Ionicons name={batteryIconName} size={16} color="rgba(255,255,255,0.85)" />
              <Text style={styles.batteryText}>{batteryLevel}%</Text>
            </View>
          </View>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Large clock                                                        */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.clockArea}>
          <Text style={styles.bigClock}>{formatLargeClock(now, settings.use24Hour)}</Text>
          <Text style={styles.fullDate}>{formatFullDate(now)}</Text>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Notification cards                                                 */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.notifArea}>
          {FAKE_NOTIFICATIONS.map((item) => (
            <NotificationCard key={item.id} item={item} />
          ))}
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Bottom area: flashlight, swipe hint, camera                       */}
        {/* ---------------------------------------------------------------- */}
        <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            style={styles.circleButton}
            onPress={() => Alert.alert('Flashlight', 'Not available in demo.')}
            accessibilityLabel="Flashlight"
          >
            <BlurView intensity={40} tint="dark" style={styles.circleBlur}>
              <Ionicons name="flashlight" size={22} color="#fff" />
            </BlurView>
          </Pressable>

          <View style={styles.swipeHintWrap}>
            <Ionicons name="chevron-up" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={styles.swipeHint}>Swipe up to unlock</Text>
          </View>

          <Pressable
            style={styles.circleButton}
            onPress={() => Alert.alert('Camera', 'Not available in demo.')}
            accessibilityLabel="Camera"
          >
            <BlurView intensity={40} tint="dark" style={styles.circleBlur}>
              <Ionicons name="camera" size={22} color="#fff" />
            </BlurView>
          </Pressable>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },

  // Status row
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  statusTime: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '500',
  },
  statusRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  batteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  batteryText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '500',
    marginLeft: 2,
  },

  // Clock
  clockArea: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 28,
    paddingHorizontal: 20,
  },
  bigClock: {
    fontSize: 80,
    fontWeight: '200',
    color: '#ffffff',
    letterSpacing: -3,
    lineHeight: 88,
  },
  fullDate: {
    fontSize: 18,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
    letterSpacing: 0.2,
  },

  // Notifications
  notifArea: {
    flex: 1,
    paddingHorizontal: 16,
    gap: 8,
  },
  notifCard: {
    borderRadius: 14,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  notifIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },
  notifApp: {
    flex: 1,
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notifTime: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '400',
  },
  notifPreview: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: -0.2,
  },

  // Bottom
  bottomArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    paddingTop: 16,
  },
  circleButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
  },
  circleBlur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  swipeHintWrap: {
    alignItems: 'center',
    gap: 2,
  },
  swipeHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: 0.1,
  },
});
