import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Alert,
  Dimensions,
  Linking,
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

import * as Haptics from 'expo-haptics';
import { useDevice } from '../store/DeviceStore';
import { useSettings } from '../store/SettingsStore';
import { useApps } from '../store/AppsStore';

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

const LOCK_PIN_KEY = '@lock_pin';
const DEFAULT_PIN = '1234';

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
  const [showPasscode, setShowPasscode] = useState(false);
  const [passcode, setPasscode] = useState('');
  const passcodeShake = useSharedValue(0);
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [notifications, setNotifications] = useState<RealNotification[]>([]);

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
    const mod = await getLauncher();
    if (mod) {
      const launched =
        (await mod.launchApp('com.android.camera2').catch(() => false)) ||
        (await mod.launchApp('com.google.android.GoogleCamera').catch(() => false));
      if (!launched) {
        Linking.openURL('content://media/internal/images/media').catch(() =>
          Alert.alert('Camera', 'Could not open camera app.')
        );
      }
    } else {
      Linking.openURL('content://media/internal/images/media').catch(() =>
        Alert.alert('Camera', 'Could not open camera app.')
      );
    }
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

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Ensure a default PIN exists in AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(LOCK_PIN_KEY).then((stored) => {
      if (!stored) {
        AsyncStorage.setItem(LOCK_PIN_KEY, DEFAULT_PIN);
      }
    });
  }, []);

  const passcodeShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: passcodeShake.value }],
  }));

  const handlePasscodeDigit = useCallback((digit: string) => {
    setPasscode((prev) => {
      if (prev.length >= 4) return prev;
      const next = prev + digit;
      if (next.length === 4) {
        // Verify PIN asynchronously
        AsyncStorage.getItem(LOCK_PIN_KEY).then((stored) => {
          const pin = stored ?? DEFAULT_PIN;
          if (next === pin) {
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
            // Clear after a short delay so user sees the dots filled briefly
            setTimeout(() => setPasscode(''), 300);
          }
        });
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        // User cancelled or biometric failed
        setAuthFailed(true);
        if (result.error === 'user_cancel' || result.error === 'system_cancel' || result.error === 'app_cancel') {
          // User cancelled — stay on lock screen, offer passcode
          setShowPasscode(false);
        } else {
          // Authentication failure — show both retry and passcode
          setShowPasscode(false);
        }
      }
    } catch {
      // Expected: biometrics not available — fall back to passcode
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
        {/* Passcode UI (shown when biometric fails or is unavailable)       */}
        {/* ---------------------------------------------------------------- */}
        {showPasscode && (
          <View style={styles.passcodeOverlay}>
            <Text style={styles.passcodeTitle}>Enter Passcode</Text>
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
              <Text style={styles.passcodeCancelText}>Cancel</Text>
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
                <Text style={styles.authFailedText}>
                  Authentication failed
                </Text>
                <View style={styles.authFailedButtons}>
                  <Pressable
                    onPress={() => { setAuthFailed(false); triggerBiometric(); }}
                    style={styles.authActionButton}
                    accessibilityLabel="Try biometric unlock again"
                    accessibilityRole="button"
                  >
                    <Text style={styles.authActionText}>Try Again</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { setAuthFailed(false); setShowPasscode(true); }}
                    style={styles.authActionButton}
                    accessibilityLabel="Use passcode to unlock"
                    accessibilityRole="button"
                  >
                    <Text style={styles.authActionText}>Use Passcode</Text>
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
                <Text style={styles.usePasscodeText}>Use Passcode</Text>
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
