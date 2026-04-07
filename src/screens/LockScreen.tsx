import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
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

import * as Haptics from 'expo-haptics';
import { useDevice } from '../store/DeviceStore';
import { useSettings } from '../store/SettingsStore';
import { useApps } from '../store/AppsStore';

const getLauncher = async () => {
  try {
    return (await import('../../modules/launcher-module/src')).default;
  } catch {
    return null;
  }
};

interface RealNotification {
  id: string;
  packageName: string;
  title: string;
  text: string;
  time: number;
  isOngoing: boolean;
}

function formatNotifTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) {
    const d = new Date(timestamp);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }
  return 'Yesterday';
}

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
// Notification helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function NotificationCard({ item, appName, appIcon }: {
  item: RealNotification;
  appName: string;
  appIcon: string;
}) {
  return (
    <BlurView intensity={40} tint="dark" experimentalBlurMethod="dimezisBlurView" style={styles.notifCard}>
      <View style={styles.notifHeader}>
        {appIcon ? (
          <Image
            source={{ uri: `data:image/png;base64,${appIcon}` }}
            style={styles.notifIconWrap}
          />
        ) : (
          <View style={[styles.notifIconWrap, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
            <Ionicons name="notifications" size={14} color="#fff" />
          </View>
        )}
        <Text style={styles.notifApp}>{appName}</Text>
        <Text style={styles.notifTime}>{formatNotifTime(item.time)}</Text>
      </View>
      {!!item.title && (
        <Text style={styles.notifTitle} numberOfLines={1}>
          {item.title}
        </Text>
      )}
      {!!item.text && (
        <Text style={styles.notifPreview} numberOfLines={2}>
          {item.text}
        </Text>
      )}
    </BlurView>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export function LockScreen({ navigation, onUnlock }: { navigation?: any; route?: any; onUnlock?: () => void }) {
  const insets = useSafeAreaInsets();
  const device = useDevice();
  const { settings } = useSettings();
  const { apps } = useApps();

  const [now, setNow] = useState(new Date());
  const [authFailed, setAuthFailed] = useState(false);
  const [notifications, setNotifications] = useState<RealNotification[]>([]);

  // Fetch real notifications
  useEffect(() => {
    let mounted = true;
    (async () => {
      const mod = await getLauncher();
      if (!mod || !mounted) return;
      try {
        const access = await mod.isNotificationAccessGranted();
        if (access && mounted) {
          const notifs = await mod.getNotifications();
          // Filter out ongoing notifications (media players, etc.) and limit to 5
          const filtered = notifs
            .filter((n: RealNotification) => !n.isOngoing)
            .sort((a: RealNotification, b: RealNotification) => b.time - a.time)
            .slice(0, 5);
          if (mounted) setNotifications(filtered);
        }
      } catch { /* notification access not available */ }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Biometric unlock on mount
  const triggerBiometric = async () => {
    try {
      const LocalAuth = await import('expo-local-authentication');
      const hasHardware = await LocalAuth.hasHardwareAsync();
      const isEnrolled = await LocalAuth.isEnrolledAsync();
      if (hasHardware && isEnrolled) {
        const result = await LocalAuth.authenticateAsync({
          promptMessage: 'Unlock your phone',
          fallbackLabel: 'Use swipe',
          disableDeviceFallback: false,
        });
        if (result.success) {
          handleUnlock();
        } else {
          setAuthFailed(true);
          setTimeout(() => setAuthFailed(false), 2000);
        }
      }
    } catch { /* biometrics not available */ }
  };

  useEffect(() => {
    triggerBiometric();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swipe-up animation
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  const handleUnlock = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (onUnlock) {
      onUnlock();
    } else {
      navigation?.goBack();
    }
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
      <Animated.View
        style={[styles.root, animatedStyle]}
        accessibilityLabel="Swipe up to unlock"
        accessibilityRole="button"
      >
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
          <Text style={styles.fullDate}>{formatFullDate(now)}</Text>
          <Text style={styles.bigClock}>{formatLargeClock(now, settings.use24Hour)}</Text>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Notification cards (real device notifications only)               */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.notifArea}>
          {notifications.map((item) => {
            const appInfo = apps.find(a => a.packageName === item.packageName);
            const appName = appInfo?.name ?? item.packageName.split('.').pop() ?? 'App';
            return (
              <NotificationCard
                key={item.id}
                item={item}
                appName={appName}
                appIcon={appInfo?.icon ?? ''}
              />
            );
          })}
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Bottom area: flashlight, swipe hint, camera                       */}
        {/* ---------------------------------------------------------------- */}
        <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            style={styles.circleButton}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Alert.alert('Flashlight', 'Not available in demo.'); }}
            accessibilityLabel="Flashlight"
          >
            <BlurView intensity={40} tint="dark" experimentalBlurMethod="dimezisBlurView" style={styles.circleBlur}>
              <Ionicons name="flashlight" size={22} color="#fff" />
            </BlurView>
          </Pressable>

          <View style={styles.swipeHintWrap}>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); triggerBiometric(); }}
              accessibilityLabel="Biometric unlock"
              style={styles.biometricButton}
            >
              <Ionicons name="finger-print" size={28} color="rgba(255,255,255,0.75)" />
            </Pressable>
            {authFailed && (
              <Text style={styles.authFailedText}>
                Authentication failed. Swipe up to unlock.
              </Text>
            )}
            <View style={styles.homeIndicator} />
          </View>

          <Pressable
            style={styles.circleButton}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Alert.alert('Camera', 'Not available in demo.'); }}
            accessibilityLabel="Camera"
          >
            <BlurView intensity={40} tint="dark" experimentalBlurMethod="dimezisBlurView" style={styles.circleBlur}>
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
    fontSize: 96,
    fontWeight: '200',
    color: '#ffffff',
    letterSpacing: -3,
    lineHeight: 104,
  },
  fullDate: {
    fontSize: 20,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 2,
    letterSpacing: 0.2,
  },

  // Notifications
  notifArea: {
    flex: 1,
    paddingHorizontal: 16,
    gap: 8,
    justifyContent: 'flex-end',
  },
  notifCard: {
    borderRadius: 14,
    overflow: 'hidden',
    paddingHorizontal: 12,
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
  notifTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
    marginBottom: 1,
  },
  notifPreview: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '400',
    letterSpacing: -0.2,
    lineHeight: 19,
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
    justifyContent: 'center',
    gap: 10,
  },
  biometricButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  authFailedText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 16,
  },
  homeIndicator: {
    width: 134,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
});
