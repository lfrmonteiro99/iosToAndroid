import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
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
  withSequence,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import * as Haptics from 'expo-haptics';
import { useDevice } from '../store/DeviceStore';
import { useSettings } from '../store/SettingsStore';
import { useApps } from '../store/AppsStore';
import { useTheme } from '../theme/ThemeContext';

const getLauncher = async () => {
  try {
    return (await import('../../modules/launcher-module/src')).default;
  } catch {
    return null; // Expected: module unavailable on non-Android
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

import { WALLPAPERS, darkenHex } from '../utils/wallpapers';

const LOCK_PIN_KEY = 'lock_pin';
const LOCK_PIN_LEGACY_KEY = '@lock_pin';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SWIPE_THRESHOLD = 100;

function formatTime(date: Date, use24Hour: boolean): string {
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

/** Extract a human-readable app name from a packageName.
 *  e.g. "com.whatsapp" → "Whatsapp", "com.google.android.gm" → "Gm"
 *  The caller may override this with the real app name from the app store. */
function appNameFromPackage(packageName: string): string {
  const last = packageName.split('.').pop() ?? 'App';
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/** Generate a stable colour for an app icon circle based on packageName hash. */
const APP_ICON_COLORS = [
  '#5856D6', '#FF9500', '#FF2D55', '#4CD964', '#007AFF',
  '#FFCC00', '#FF3B30', '#5AC8FA', '#AF52DE', '#34C759',
];

function appIconColor(packageName: string): string {
  let hash = 0;
  for (let i = 0; i < packageName.length; i++) {
    hash = (hash * 31 + packageName.charCodeAt(i)) | 0;
  }
  return APP_ICON_COLORS[Math.abs(hash) % APP_ICON_COLORS.length];
}

interface NotificationGroupData {
  packageName: string;
  appName: string;
  appIcon: string;
  notifications: RealNotification[];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function NotificationGroupCard({
  group,
  expanded,
  onToggle,
  onDismissNotif,
  onDismissGroup,
  onOpenNotif,
}: {
  group: NotificationGroupData;
  expanded: boolean;
  onToggle: () => void;
  onDismissNotif: (id: string) => void;
  onDismissGroup: (packageName: string) => void;
  onOpenNotif: (notif: RealNotification) => void;
}) {
  const { textScale } = useTheme();
  const color = appIconColor(group.packageName);
  const initial = group.appName.charAt(0).toUpperCase();
  const count = group.notifications.length;
  // Most recent notification is first (already sorted by time desc)
  const latest = group.notifications[0];

  return (
    <View style={styles.groupContainer}>
      {/* App header row */}
      <Pressable onPress={count > 1 ? onToggle : undefined} style={styles.groupHeader}>
        {group.appIcon ? (
          <Image
            source={{ uri: `data:image/png;base64,${group.appIcon}` }}
            style={styles.groupAppIcon}
          />
        ) : (
          <View style={[styles.groupAppIcon, { backgroundColor: color }]}>
            <Text style={styles.groupAppIconLetter}>{initial}</Text>
          </View>
        )}
        <Text style={[styles.groupAppName, { fontSize: 13 * textScale }]}>
          {group.appName}
        </Text>
        {count > 1 && !expanded && (
          <Text style={[styles.groupCount, { fontSize: 12 * textScale }]}>
            {count} notifications
          </Text>
        )}
        {count > 1 && (
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color="rgba(255,255,255,0.5)"
            style={{ marginLeft: 4 }}
          />
        )}
        <Text style={[styles.notifTime, { fontSize: 12 * textScale, marginLeft: 'auto' }]}>
          {formatNotifTime(latest.time)}
        </Text>
        {/* Clear all for this app's notifications */}
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDismissGroup(group.packageName); }}
          hitSlop={8}
          style={styles.groupClearBtn}
          accessibilityLabel={`Clear all ${group.appName} notifications`}
          accessibilityRole="button"
        >
          <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.45)" />
        </Pressable>
      </Pressable>

      {/* Collapsed: show only latest notification */}
      {!expanded && (
        <BlurView
          intensity={40}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={styles.groupNotifCard}
        >
          <Pressable
            onPress={() => onOpenNotif(latest)}
            style={{ flex: 1 }}
            accessibilityLabel={`Open ${latest.title || group.appName}`}
            accessibilityRole="button"
          >
            {!!latest.title && (
              <Text style={[styles.notifTitle, { fontSize: 15 * textScale }]} numberOfLines={1}>
                {latest.title}
              </Text>
            )}
            {!!latest.text && (
              <Text style={[styles.notifPreview, { fontSize: 14 * textScale }]} numberOfLines={2}>
                {latest.text}
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDismissNotif(latest.id); }}
            hitSlop={8}
            style={styles.notifDismissBtn}
            accessibilityLabel="Dismiss notification"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" />
          </Pressable>
        </BlurView>
      )}

      {/* Expanded: show all notifications */}
      {expanded &&
        group.notifications.map((item) => (
          <BlurView
            key={item.id}
            intensity={40}
            tint="dark"
            experimentalBlurMethod="dimezisBlurView"
            style={styles.groupNotifCard}
          >
            <Pressable
              onPress={() => onOpenNotif(item)}
              style={{ flex: 1 }}
              accessibilityLabel={`Open ${item.title || group.appName}`}
              accessibilityRole="button"
            >
              <View style={styles.expandedNotifHeader}>
                {!!item.title && (
                  <Text
                    style={[styles.notifTitle, { fontSize: 15 * textScale, flex: 1 }]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                )}
                <Text style={[styles.notifTime, { fontSize: 11 * textScale }]}>
                  {formatNotifTime(item.time)}
                </Text>
              </View>
              {!!item.text && (
                <Text style={[styles.notifPreview, { fontSize: 14 * textScale }]} numberOfLines={2}>
                  {item.text}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDismissNotif(item.id); }}
              hitSlop={8}
              style={styles.notifDismissBtn}
              accessibilityLabel="Dismiss notification"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" />
            </Pressable>
          </BlurView>
        ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function LockScreen({ navigation, onUnlock }: { navigation?: any; route?: any; onUnlock?: () => void }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const insets = useSafeAreaInsets();
  const device = useDevice();
  const { settings } = useSettings();
  const { apps } = useApps();
  const { textScale } = useTheme();

  const [now, setNow] = useState(new Date());
  const [authFailed, setAuthFailed] = useState(false);
  const [showPasscode, setShowPasscode] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const passcodeShake = useSharedValue(0);
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [notifications, setNotifications] = useState<RealNotification[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [dismissedNotifIds, setDismissedNotifIds] = useState<Set<string>>(new Set());

  const handleDismissNotif = useCallback((id: string) => {
    setDismissedNotifIds(prev => new Set(prev).add(id));
  }, []);

  const handleDismissGroup = useCallback((packageName: string) => {
    setDismissedNotifIds(prev => {
      const next = new Set(prev);
      notifications
        .filter(n => n.packageName === packageName)
        .forEach(n => next.add(n.id));
      return next;
    });
  }, [notifications]);

  const handleOpenNotif = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Cannot open apps from lock screen without authentication
    // Trigger biometric/passcode flow
    setShowPasscode(true);
  }, []);

  const groupedNotifications = useMemo((): NotificationGroupData[] => {
    const activeNotifications = notifications.filter(n => !dismissedNotifIds.has(n.id));
    const groupMap = new Map<string, RealNotification[]>();
    for (const n of activeNotifications) {
      const existing = groupMap.get(n.packageName);
      if (existing) {
        existing.push(n);
      } else {
        groupMap.set(n.packageName, [n]);
      }
    }
    const groups: NotificationGroupData[] = [];
    for (const [packageName, notifs] of groupMap) {
      // Sort each group by time descending (most recent first)
      notifs.sort((a, b) => b.time - a.time);
      const appInfo = apps.find(a => a.packageName === packageName);
      groups.push({
        packageName,
        appName: appInfo?.name ?? appNameFromPackage(packageName),
        appIcon: appInfo?.icon ?? '',
        notifications: notifs,
      });
    }
    // Sort groups by the most recent notification time (most recent group first)
    groups.sort((a, b) => b.notifications[0].time - a.notifications[0].time);
    return groups;
  }, [notifications, apps, dismissedNotifIds]);

  const toggleGroup = useCallback((packageName: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [packageName]: !prev[packageName],
    }));
  }, []);

  const toggleFlashlight = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const mod = await getLauncher();
    if (mod) {
      const newState = !flashlightOn;
      try {
        const success = await mod.setFlashlight(newState);
        if (success) setFlashlightOn(newState);
      } catch {
        // Expected: flashlight not available on this device
      }
    }
  };

  const openCamera = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Unlock first, then navigate to in-app Camera screen (no Android system apps)
    handleUnlock();
    setTimeout(() => {
      if (navigation) {
        navigation.navigate('Camera');
      }
    }, 300);
  };

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
          const filtered = notifs
            .filter((n: RealNotification) => !n.isOngoing)
            .sort((a: RealNotification, b: RealNotification) => b.time - a.time)
            .slice(0, 5);
          if (mounted) setNotifications(filtered);
        }
      } catch { /* Expected: notification access not granted */ }
    })();
    return () => { mounted = false; };
  }, []);

  // Update clock aligned to minute boundaries (like real iOS)
  useEffect(() => {
    const intervalRef: { current: ReturnType<typeof setInterval> | null } = { current: null };
    const msUntilNextMinute = (60 - new Date().getSeconds()) * 1000 - new Date().getMilliseconds();
    const timeout = setTimeout(() => {
      setNow(new Date());
      intervalRef.current = setInterval(() => setNow(new Date()), 60_000);
    }, msUntilNextMinute);
    return () => {
      clearTimeout(timeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Migrate PIN from AsyncStorage to SecureStore if needed
  useEffect(() => {
    (async () => {
      try {
        const securePin = await SecureStore.getItemAsync(LOCK_PIN_KEY);
        if (securePin) return; // Already in SecureStore
        // Check for legacy AsyncStorage PIN
        const legacyPin = await AsyncStorage.getItem(LOCK_PIN_LEGACY_KEY);
        if (legacyPin) {
          await SecureStore.setItemAsync(LOCK_PIN_KEY, legacyPin);
          await AsyncStorage.removeItem(LOCK_PIN_LEGACY_KEY);
        }
        // No default PIN is set automatically - user must set one in settings
      } catch { /* SecureStore may not be available on all platforms */ }
    })();
  }, []);

  const passcodeShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: passcodeShake.value }],
  }));

  const handlePasscodeDigit = useCallback((digit: string) => {
    // Rate limiting: block input during lockout period
    if (Date.now() < lockoutUntil) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setPasscode((prev) => {
      if (prev.length >= 4) return prev;
      const next = prev + digit;
      if (next.length === 4) {
        // Verify PIN from SecureStore (fall back to AsyncStorage for legacy)
        (async () => {
          let pin: string | null = null;
          let storeAvailable = false;
          try {
            pin = await SecureStore.getItemAsync(LOCK_PIN_KEY);
            storeAvailable = true;
          } catch { /* SecureStore unavailable */ }
          if (!pin && !storeAvailable) {
            // SecureStore failed — try legacy AsyncStorage as last resort
            try { pin = await AsyncStorage.getItem(LOCK_PIN_LEGACY_KEY); } catch { /* ignore */ }
          } else if (!pin) {
            // SecureStore is available but no PIN set — try legacy migration
            try { pin = await AsyncStorage.getItem(LOCK_PIN_LEGACY_KEY); } catch { /* ignore */ }
          }
          // If no PIN is set anywhere, allow unlock (first-time user)
          if (!pin || next === pin) {
            setFailedAttempts(0);
            handleUnlock();
          } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            passcodeShake.value = withSequence(
              withTiming(-12, { duration: 50 }),
              withTiming(12, { duration: 50 }),
              withTiming(-12, { duration: 50 }),
              withTiming(12, { duration: 50 }),
              withTiming(0, { duration: 50 }),
            );
            // Increment failed attempts and apply lockout if threshold reached
            setFailedAttempts(prev => {
              const next = prev + 1;
              if (next >= 10) {
                setLockoutUntil(Date.now() + 300000); // 5 min lockout after 10 failures
              } else if (next >= 5) {
                setLockoutUntil(Date.now() + 30000); // 30 sec lockout after 5 failures
              }
              return next;
            });
            // Clear after shake animation completes (250ms)
            setTimeout(() => setPasscode(''), 350);
          }
        })();
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockoutUntil]);

  const handlePasscodeDelete = useCallback(() => {
    setPasscode((prev) => prev.slice(0, -1));
  }, []);

  // Biometric unlock on mount
  const triggerBiometric = async () => {
    try {
      const LocalAuth = await import('expo-local-authentication');
      const hasHardware = await LocalAuth.hasHardwareAsync();
      const isEnrolled = await LocalAuth.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        // No biometrics available — go straight to passcode
        setShowPasscode(true);
        return;
      }

      const result = await LocalAuth.authenticateAsync({
        promptMessage: 'Unlock your phone',
        fallbackLabel: 'Use Passcode',
        disableDeviceFallback: true,
      });

      if (result.success) {
        handleUnlock();
      } else {
        // Biometric failed or user cancelled — always show passcode as fallback
        setAuthFailed(true);
        setShowPasscode(true);
      }
    } catch {
      // Expected: biometrics not available — fall back to passcode
      setAuthFailed(true);
      setShowPasscode(true);
    }
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
          <Text style={[styles.statusTime, { fontSize: 12 * textScale }]}>{formatTime(now, settings.use24Hour)}</Text>
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
              <Text style={[styles.batteryText, { fontSize: 11 * textScale }]}>{batteryLevel}%</Text>
            </View>
          </View>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Large clock                                                        */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.clockArea}>
          <Text style={[styles.fullDate, { fontSize: 20 * textScale }]}>{formatFullDate(now)}</Text>
          <Text style={styles.bigClock}>{formatLargeClock(now, settings.use24Hour)}</Text>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Notification cards (grouped by app, iOS-style)                   */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.notifArea}>
          {groupedNotifications.map((group) => (
            <NotificationGroupCard
              key={group.packageName}
              group={group}
              expanded={!!expandedGroups[group.packageName]}
              onToggle={() => toggleGroup(group.packageName)}
              onDismissNotif={handleDismissNotif}
              onDismissGroup={handleDismissGroup}
              onOpenNotif={handleOpenNotif}
            />
          ))}
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Passcode UI (shown when biometric fails or is unavailable)       */}
        {/* ---------------------------------------------------------------- */}
        {showPasscode && (
          <View style={styles.passcodeOverlay}>
            <Text style={[styles.passcodeTitle, { fontSize: 18 * textScale }]}>Enter Passcode</Text>
            {Date.now() < lockoutUntil ? (
              <Text style={[styles.passcodeLockout, { fontSize: 14 * textScale }]}>
                Try again in {Math.ceil((lockoutUntil - Date.now()) / 1000)}s
              </Text>
            ) : null}
            <Animated.View style={[styles.passcodeDots, passcodeShakeStyle]}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.passcodeDot,
                    i < passcode.length && styles.passcodeDotFilled,
                  ]}
                />
              ))}
            </Animated.View>
            <View style={styles.numpad}>
              {[
                ['1', '2', '3'],
                ['4', '5', '6'],
                ['7', '8', '9'],
                ['', '0', 'del'],
              ].map((row, ri) => (
                <View key={ri} style={styles.numpadRow}>
                  {row.map((key) => {
                    if (key === '') return <View key="empty" style={styles.numpadKey} />;
                    if (key === 'del') {
                      return (
                        <Pressable
                          key="del"
                          style={styles.numpadKey}
                          onPress={handlePasscodeDelete}
                          accessibilityLabel="Delete"
                        >
                          <Ionicons name="backspace-outline" size={24} color="#fff" />
                        </Pressable>
                      );
                    }
                    return (
                      <Pressable
                        key={key}
                        style={styles.numpadKey}
                        onPress={() => handlePasscodeDigit(key)}
                        accessibilityLabel={`Digit ${key}`}
                      >
                        <Text style={styles.numpadKeyText}>{key}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
            <Pressable
              onPress={() => { setShowPasscode(false); setPasscode(''); }}
              style={styles.passcodeCancel}
              accessibilityLabel="Cancel passcode entry"
              accessibilityRole="button"
            >
              <Text style={[styles.passcodeCancelText, { fontSize: 15 * textScale }]}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Bottom area: flashlight, swipe hint, camera                       */}
        {/* ---------------------------------------------------------------- */}
        {!showPasscode && (
        <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            style={styles.circleButton}
            onPress={toggleFlashlight}
            accessibilityLabel="Flashlight"
          >
            <BlurView intensity={40} tint="dark" experimentalBlurMethod="dimezisBlurView" style={[styles.circleBlur, flashlightOn && { backgroundColor: 'rgba(255,255,255,0.45)' }]}>
              <Ionicons name="flashlight" size={22} color={flashlightOn ? '#000' : '#fff'} />
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
              <View style={styles.authFailedWrap}>
                <Text style={[styles.authFailedText, { fontSize: 13 * textScale }]}>
                  Face ID / Fingerprint not recognized
                </Text>
                <View style={styles.authFailedButtons}>
                  <Pressable
                    onPress={() => { setAuthFailed(false); triggerBiometric(); }}
                    style={styles.authActionButton}
                    accessibilityLabel="Try biometric unlock again"
                    accessibilityRole="button"
                  >
                    <Text style={[styles.authActionText, { fontSize: 13 * textScale }]}>Try Again</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { setAuthFailed(false); setShowPasscode(true); }}
                    style={styles.authActionButton}
                    accessibilityLabel="Use passcode to unlock"
                    accessibilityRole="button"
                  >
                    <Text style={[styles.authActionText, { fontSize: 13 * textScale }]}>Use Passcode</Text>
                  </Pressable>
                </View>
              </View>
            )}
            {!authFailed && (
              <Pressable
                onPress={() => setShowPasscode(true)}
                style={styles.usePasscodeButton}
                accessibilityLabel="Use passcode to unlock"
                accessibilityRole="button"
              >
                <Text style={[styles.usePasscodeText, { fontSize: 13 * textScale }]}>Use Passcode</Text>
              </Pressable>
            )}
            <View style={styles.homeIndicator} />
          </View>

          <Pressable
            style={styles.circleButton}
            onPress={openCamera}
            accessibilityLabel="Camera"
          >
            <BlurView intensity={40} tint="dark" experimentalBlurMethod="dimezisBlurView" style={styles.circleBlur}>
              <Ionicons name="camera" size={22} color="#fff" />
            </BlurView>
          </Pressable>
        </View>
        )}
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

  // Notification groups (iOS-style)
  groupContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  groupAppIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  groupAppIconLetter: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  groupAppName: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
  },
  groupCount: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '400',
    marginLeft: 8,
  },
  groupNotifCard: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  expandedNotifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  notifDismissBtn: {
    padding: 4,
    marginLeft: 6,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  groupClearBtn: {
    marginLeft: 8,
    padding: 2,
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
  authFailedWrap: {
    alignItems: 'center',
    gap: 8,
  },
  authFailedButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  authActionButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  authActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  usePasscodeButton: {
    paddingVertical: 6,
    marginTop: 4,
  },
  usePasscodeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
  },

  // Passcode
  passcodeOverlay: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 40,
  },
  passcodeTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 20,
  },
  passcodeLockout: {
    color: '#FF9500',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    textAlign: 'center',
  },
  passcodeDots: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 28,
  },
  passcodeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'transparent',
  },
  passcodeDotFilled: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  numpad: {
    gap: 12,
  },
  numpadRow: {
    flexDirection: 'row',
    gap: 24,
    justifyContent: 'center',
  },
  numpadKey: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numpadKeyText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
  },
  passcodeCancel: {
    marginTop: 16,
    paddingVertical: 8,
  },
  passcodeCancelText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    fontWeight: '500',
  },
});
