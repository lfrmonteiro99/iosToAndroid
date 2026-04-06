import React, { useState, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Pressable,
  StatusBar,
  Dimensions,
} from 'react-native';

const getLauncher = async () => {
  try {
    return (await import('../../modules/launcher-module/src')).default;
  } catch {
    return null;
  }
};
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

import { useDevice } from '../store/DeviceStore';
import { useSettings } from '../store/SettingsStore';
import { useTheme } from '../theme/ThemeContext';
import * as Haptics from 'expo-haptics';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const TOGGLE_SIZE = 70;
const SHORTCUT_SIZE = 50;

// ---------------------------------------------------------------------------
// Toggle button component
// ---------------------------------------------------------------------------

interface ToggleButtonProps {
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  active: boolean;
  activeColor?: string;
  onPress: () => void;
}

function ToggleButton({
  iconName,
  label,
  sublabel,
  active,
  activeColor = '#0A84FF',
  onPress,
}: ToggleButtonProps) {
  return (
    <Pressable onPress={onPress} style={styles.toggleWrap} accessibilityLabel={label}>
      <View
        style={[
          styles.toggleButton,
          { backgroundColor: active ? activeColor : 'rgba(255,255,255,0.18)' },
        ]}
      >
        <Ionicons name={iconName} size={26} color="#ffffff" />
      </View>
      <Text style={styles.toggleLabel} numberOfLines={1}>
        {label}
      </Text>
      {sublabel ? (
        <Text style={styles.toggleSublabel} numberOfLines={1}>
          {sublabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Shortcut button
// ---------------------------------------------------------------------------

interface ShortcutButtonProps {
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
}

function ShortcutButton({ iconName, label, active = false, onPress }: ShortcutButtonProps) {
  return (
    <Pressable onPress={onPress} style={styles.shortcutWrap} accessibilityLabel={label}>
      <View
        style={[
          styles.shortcutCircle,
          active ? { backgroundColor: '#FFFFFF' } : null,
        ]}
      >
        <Ionicons name={iconName} size={22} color={active ? '#000000' : '#ffffff'} />
      </View>
      <Text style={styles.shortcutLabel}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export function ControlCenterScreen({ navigation }: { navigation: any; route: any }) {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const device = useDevice();
  const { settings, update } = useSettings();
  const { theme } = useTheme();
  const { colors } = theme;

  const [volume, setVolume] = useState(0.5);
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [nowPlaying, setNowPlaying] = useState({ title: '', artist: '', album: '', isPlaying: false, packageName: '' });

  useEffect(() => {
    (async () => {
      const mod = await getLauncher();
      if (mod) {
        try {
          const [flashState, np] = await Promise.all([
            mod.isFlashlightOn(),
            mod.getNowPlaying(),
          ]);
          setFlashlightOn(!!flashState);
          setNowPlaying(np);
        } catch {
          // ignore
        }
      }
    })();
  }, []);

  const toggleFlashlight = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const mod = await getLauncher();
    if (mod) {
      const newState = !flashlightOn;
      try {
        const success = await mod.setFlashlight(newState);
        if (success) setFlashlightOn(newState);
      } catch {
        // ignore
      }
    }
  };

  const launchCalculator = () => {
    navigation.goBack();
    setTimeout(() => nav.navigate('Calculator'), 300);
  };

  const launchCamera = async () => {
    const mod = await getLauncher();
    if (mod) {
      const launched =
        (await mod.launchApp('com.android.camera2').catch(() => false)) ||
        (await mod.launchApp('com.google.android.GoogleCamera').catch(() => false));
      if (!launched) Alert.alert('Camera not found');
    }
  };

  // Swipe-down gesture to close
  const translateY = useSharedValue(0);
  const backdropOpacity = useSharedValue(1);

  const handleClose = () => {
    navigation.goBack();
  };

  const swipeDownGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
        backdropOpacity.value = Math.max(0, 1 - e.translationY / (SCREEN_HEIGHT * 0.4));
      }
    })
    .onEnd((e) => {
      if (e.translationY > 80 || e.velocityY > 600) {
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 250 });
        backdropOpacity.value = withTiming(0, { duration: 250 }, () => {
          runOnJS(handleClose)();
        });
      } else {
        translateY.value = withTiming(0, { duration: 200 });
        backdropOpacity.value = withTiming(1, { duration: 200 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  // Focus mode toggle
  const toggleFocus = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    update('focusMode', settings.focusMode === 'off' ? 'doNotDisturb' : 'off');
  };

  const batteryLevel = Math.round(device.battery.level * 100);

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Backdrop — tap to close */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      {/* Control Center sheet */}
      <GestureDetector gesture={swipeDownGesture}>
        <Animated.View
          style={[styles.sheet, { paddingBottom: insets.bottom + 12 }, sheetStyle]}
        >
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

          {/* Drag handle */}
          <View style={styles.handle} />

          {/* ------------------------------------------------------------ */}
          {/* Top 2x2 toggle grid                                            */}
          {/* ------------------------------------------------------------ */}
          <View style={styles.section}>
            <View style={styles.toggleGrid}>
              <ToggleButton
                iconName="airplane"
                label="Airplane"
                active={settings.airplaneMode}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  update('airplaneMode', !settings.airplaneMode);
                  device.openSystemPanel('airplane');
                }}
              />
              <ToggleButton
                iconName="wifi"
                label="Wi-Fi"
                sublabel={device.wifi.enabled ? (device.wifi.ssid || 'On') : 'Off'}
                active={device.wifi.enabled}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); device.toggleWifi(); }}
              />
              <ToggleButton
                iconName="bluetooth"
                label="Bluetooth"
                sublabel={device.bluetooth.enabled ? 'On' : 'Off'}
                active={device.bluetooth.enabled}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); device.toggleBluetooth(); }}
              />
              <ToggleButton
                iconName="moon"
                label="Focus"
                sublabel={settings.focusMode !== 'off' ? 'Do Not Disturb' : 'Off'}
                active={settings.focusMode !== 'off'}
                activeColor={colors.systemPurple}
                onPress={toggleFocus}
              />
            </View>
          </View>

          {/* ------------------------------------------------------------ */}
          {/* Music controls                                                  */}
          {/* ------------------------------------------------------------ */}
          <View style={styles.section}>
            <View style={styles.musicCard}>
              <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.musicInner}>
                <View style={styles.musicAlbumArt}>
                  <Ionicons name="musical-notes" size={28} color="rgba(255,255,255,0.4)" />
                </View>
                <View style={styles.musicMeta}>
                  <Text style={styles.musicTitle} numberOfLines={1}>
                    {nowPlaying.title || 'Not Playing'}
                  </Text>
                  <Text style={styles.musicArtist} numberOfLines={1}>
                    {nowPlaying.artist || '—'}
                  </Text>
                </View>
                <View style={styles.musicControls}>
                  <Pressable
                    onPress={() => {}}
                    accessibilityLabel="Previous track"
                    style={styles.musicBtn}
                  >
                    <Ionicons name="play-skip-back" size={20} color="#ffffff" />
                  </Pressable>
                  <Pressable
                    onPress={() => setNowPlaying((p) => ({ ...p, isPlaying: !p.isPlaying }))}
                    accessibilityLabel={nowPlaying.isPlaying ? 'Pause' : 'Play'}
                    style={styles.musicPlayBtn}
                  >
                    <Ionicons
                      name={nowPlaying.isPlaying ? 'pause' : 'play'}
                      size={22}
                      color="#ffffff"
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => {}}
                    accessibilityLabel="Next track"
                    style={styles.musicBtn}
                  >
                    <Ionicons name="play-skip-forward" size={20} color="#ffffff" />
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          {/* ------------------------------------------------------------ */}
          {/* Brightness + Volume vertical sliders (side by side)             */}
          {/* ------------------------------------------------------------ */}
          <View style={styles.section}>
            <View style={styles.verticalSlidersRow}>
              {/* Brightness */}
              <View style={styles.verticalSliderWrap}>
                <Ionicons name="sunny" size={14} color="rgba(255,255,255,0.6)" style={{ marginBottom: 6 }} />
                <Pressable
                  style={styles.verticalSliderTrack}
                  onPress={(e) => {
                    const relY = e.nativeEvent.locationY;
                    const pct = Math.max(0, Math.min(1, 1 - relY / 160));
                    device.setBrightness(pct);
                  }}
                >
                  <View
                    style={[
                      styles.verticalSliderFill,
                      { height: `${device.brightness * 100}%` as unknown as number },
                    ]}
                  />
                  <Ionicons
                    name="sunny"
                    size={16}
                    color="rgba(255,255,255,0.8)"
                    style={styles.verticalSliderIconBottom}
                  />
                </Pressable>
                <Text style={styles.verticalSliderLabel}>Brightness</Text>
              </View>

              {/* Volume */}
              <View style={styles.verticalSliderWrap}>
                <Ionicons name="volume-high" size={14} color="rgba(255,255,255,0.6)" style={{ marginBottom: 6 }} />
                <Pressable
                  style={styles.verticalSliderTrack}
                  onPress={(e) => {
                    const relY = e.nativeEvent.locationY;
                    const pct = Math.max(0, Math.min(1, 1 - relY / 160));
                    setVolume(pct);
                  }}
                >
                  <View
                    style={[
                      styles.verticalSliderFill,
                      { height: `${volume * 100}%` as unknown as number },
                    ]}
                  />
                  <Ionicons
                    name="volume-low"
                    size={16}
                    color="rgba(255,255,255,0.8)"
                    style={styles.verticalSliderIconBottom}
                  />
                </Pressable>
                <Text style={styles.verticalSliderLabel}>Volume</Text>
              </View>
            </View>
          </View>

          {/* ------------------------------------------------------------ */}
          {/* Bottom shortcut row                                             */}
          {/* ------------------------------------------------------------ */}
          <View style={styles.section}>
            <View style={styles.shortcutRow}>
              <ShortcutButton
                iconName="flashlight"
                label="Torch"
                active={flashlightOn}
                onPress={toggleFlashlight}
              />
              <ShortcutButton
                iconName="radio-button-on"
                label="Screen Rec"
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert('Screen Recording', 'Screen recording requires system permission.'); }}
              />
              <ShortcutButton
                iconName="calculator-outline"
                label="Calculator"
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); launchCalculator(); }}
              />
              <ShortcutButton
                iconName="camera-outline"
                label="Camera"
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); launchCamera(); }}
              />
            </View>
          </View>

          {/* ------------------------------------------------------------ */}
          {/* Screen mirroring tile                                           */}
          {/* ------------------------------------------------------------ */}
          <View style={styles.section}>
            <Pressable
              style={styles.mirrorTile}
              onPress={() => Alert.alert('Screen Mirroring', 'Not available in demo.')}
              accessibilityLabel="Screen Mirroring"
            >
              <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.mirrorInner}>
                <Ionicons name="tv-outline" size={18} color="#ffffff" />
                <Text style={styles.mirrorLabel}>Screen Mirroring</Text>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color="rgba(255,255,255,0.5)"
                  style={{ marginLeft: 'auto' as unknown as number }}
                />
              </View>
            </Pressable>
          </View>

          {/* Battery info row */}
          <View style={[styles.section, styles.batteryInfoRow]}>
            <Ionicons
              name={device.battery.isCharging ? 'battery-charging' : 'battery-half-outline'}
              size={16}
              color="rgba(255,255,255,0.6)"
            />
            <Text style={styles.batteryInfoText}>
              {batteryLevel}% {device.battery.isCharging ? '· Charging' : ''}
            </Text>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },

  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    paddingTop: 8,
    backgroundColor: 'rgba(20,20,25,0.85)',
  },

  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
    alignSelf: 'center',
    marginBottom: 12,
  },

  section: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  // Toggle grid
  toggleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleWrap: {
    alignItems: 'center',
    width: TOGGLE_SIZE,
  },
  toggleButton: {
    width: TOGGLE_SIZE,
    height: TOGGLE_SIZE,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 5,
    textAlign: 'center',
  },
  toggleSublabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '400',
    textAlign: 'center',
  },

  // Music card
  musicCard: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  musicInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  musicAlbumArt: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  musicMeta: {
    flex: 1,
  },
  musicTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  musicArtist: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '400',
    marginTop: 1,
  },
  musicControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  musicBtn: {
    padding: 6,
  },
  musicPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2,
  },

  // Vertical sliders
  verticalSlidersRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
  verticalSliderWrap: {
    alignItems: 'center',
  },
  verticalSliderTrack: {
    width: 46,
    height: 160,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  verticalSliderFill: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 23,
  },
  verticalSliderIconBottom: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
  },
  verticalSliderLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '400',
    marginTop: 6,
    textAlign: 'center',
  },

  // Shortcut row
  shortcutRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
  shortcutWrap: {
    alignItems: 'center',
    width: SHORTCUT_SIZE + 8,
  },
  shortcutCircle: {
    width: SHORTCUT_SIZE,
    height: SHORTCUT_SIZE,
    borderRadius: SHORTCUT_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '400',
    marginTop: 5,
    textAlign: 'center',
  },

  // Mirror tile
  mirrorTile: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  mirrorInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  mirrorLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.2,
  },

  // Battery info
  batteryInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 4,
  },
  batteryInfoText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '400',
  },
});
