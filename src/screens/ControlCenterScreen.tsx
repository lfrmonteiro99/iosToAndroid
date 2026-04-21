import React, { useState, useEffect, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  Dimensions,
} from 'react-native';

const getLauncher = async () => {
  try {
    return (await import('../../modules/launcher-module/src')).default;
  } catch {
    return null; // Expected: module unavailable on non-Android
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
import { SystemColors } from '../theme/CupertinoTheme';
import { useAlert } from '../components';
import * as Haptics from 'expo-haptics';
import type { AppNavigationProp } from '../navigation/types';
import { hapticSelection } from '../utils/haptics';

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
  textScale?: number;
}

function ToggleButton({
  iconName,
  label,
  sublabel,
  active,
  activeColor = SystemColors.dark.accent,
  onPress,
  textScale = 1,
}: ToggleButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.toggleWrap}
      accessibilityLabel={`${label}, ${active ? 'on' : 'off'}. Tap to turn ${active ? 'off' : 'on'}`}
      accessibilityRole="switch"
    >
      <View
        style={[
          styles.toggleButton,
          { backgroundColor: active ? activeColor : 'rgba(255,255,255,0.18)' },
        ]}
      >
        <Ionicons name={iconName} size={26} color="#ffffff" />
      </View>
      <Text style={[styles.toggleLabel, { fontSize: 11 * textScale }]} numberOfLines={1}>
        {label}
      </Text>
      {sublabel ? (
        <Text style={[styles.toggleSublabel, { fontSize: 10 * textScale }]} numberOfLines={1}>
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
  textScale?: number;
  accessibilityLabel?: string;
}

function ShortcutButton({ iconName, label, active = false, onPress, textScale = 1, accessibilityLabel }: ShortcutButtonProps) {
  return (
    <Pressable onPress={onPress} style={styles.shortcutWrap} accessibilityLabel={accessibilityLabel ?? label} accessibilityRole="button">
      <View
        style={[
          styles.shortcutCircle,
          active ? { backgroundColor: '#FFFFFF' } : null,
        ]}
      >
        <Ionicons name={iconName} size={22} color={active ? '#000000' : '#ffffff'} />
      </View>
      <Text style={[styles.shortcutLabel, { fontSize: 11 * textScale }]}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export function ControlCenterScreen({ navigation }: { navigation: AppNavigationProp }) {
  const nav = useNavigation<AppNavigationProp>();
  const insets = useSafeAreaInsets();
  const device = useDevice();
  const { settings, update } = useSettings();
  const { theme, textScale } = useTheme();
  const { colors } = theme;

  const alert = useAlert();
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [nowPlaying, setNowPlaying] = useState({ title: '', artist: '', album: '', isPlaying: false, packageName: '' });

  const refreshNowPlaying = useCallback(async () => {
    const mod = await getLauncher();
    if (mod) {
      try {
        const np = await mod.getNowPlaying();
        setNowPlaying(np);
      } catch {
        // Expected: now-playing API may not be available
      }
    }
  }, []);

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
          // Expected: flashlight/now-playing APIs may not be available
        }
      }
    })();
  }, []);

  // Periodically refresh now-playing info every 5 seconds
  useEffect(() => {
    const interval = setInterval(refreshNowPlaying, 5000);
    return () => clearInterval(interval);
  }, [refreshNowPlaying]);

  const toggleFlashlight = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
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

  const launchCalculator = () => {
    navigation.goBack();
    setTimeout(() => nav.navigate('Calculator'), 300);
  };

  const launchCamera = () => {
    // Navigate to in-app Camera screen (no Android system apps)
    navigation.goBack();
    setTimeout(() => navigation.navigate('Camera'), 300);
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

  // Focus mode toggle — fully in-app (persisted in settings)
  const toggleFocus = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newMode = settings.focusMode === 'off' ? 'doNotDisturb' : 'off';
    update('focusMode', newMode);
  };

  const batteryLevel = Math.round(device.battery.level * 100);

  // ---- Vertical slider gesture support (brightness & volume) ----
  const SLIDER_HEIGHT = 160;

  const brightnessFill = useSharedValue(device.brightness * SLIDER_HEIGHT);
  const volumeFill = useSharedValue(device.volume * SLIDER_HEIGHT);

  // Keep shared values in sync with external device state changes.
  // Shared values (brightnessFill/volumeFill) are stable refs so we intentionally
  // omit them from deps to avoid effect re-runs on each render.
  useEffect(() => {
    brightnessFill.value = device.brightness * SLIDER_HEIGHT;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.brightness]);
  useEffect(() => {
    volumeFill.value = device.volume * SLIDER_HEIGHT;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.volume]);

  const applyBrightness = useCallback((pct: number) => {
    device.setBrightness(pct);
  }, [device]);

  const applyVolume = useCallback((pct: number) => {
    device.setVolume(pct);
  }, [device]);

  const prevBrightnessPct = useSharedValue(device.brightness);
  const prevVolumePct = useSharedValue(device.volume);

  const brightnessPanGesture = Gesture.Pan()
    .onUpdate((e) => {
      // e.y is relative to the gesture view; map to fill height
      const fill = Math.max(0, Math.min(SLIDER_HEIGHT, SLIDER_HEIGHT - e.y));
      brightnessFill.value = fill;
      const pct = fill / SLIDER_HEIGHT;
      if ((prevBrightnessPct.value > 0 && pct === 0) || (prevBrightnessPct.value < 1 && pct === 1)) {
        runOnJS(hapticSelection)();
      }
      prevBrightnessPct.value = pct;
    })
    .onEnd(() => {
      const pct = Math.max(0, Math.min(1, brightnessFill.value / SLIDER_HEIGHT));
      runOnJS(applyBrightness)(pct);
    });

  const brightnessTapGesture = Gesture.Tap()
    .onEnd((e) => {
      const fill = Math.max(0, Math.min(SLIDER_HEIGHT, SLIDER_HEIGHT - e.y));
      brightnessFill.value = fill;
      const pct = Math.max(0, Math.min(1, fill / SLIDER_HEIGHT));
      runOnJS(applyBrightness)(pct);
    });

  const brightnessGesture = Gesture.Exclusive(brightnessTapGesture, brightnessPanGesture);

  const volumePanGesture = Gesture.Pan()
    .onUpdate((e) => {
      const fill = Math.max(0, Math.min(SLIDER_HEIGHT, SLIDER_HEIGHT - e.y));
      volumeFill.value = fill;
      const pct = fill / SLIDER_HEIGHT;
      if ((prevVolumePct.value > 0 && pct === 0) || (prevVolumePct.value < 1 && pct === 1)) {
        runOnJS(hapticSelection)();
      }
      prevVolumePct.value = pct;
    })
    .onEnd(() => {
      const pct = Math.max(0, Math.min(1, volumeFill.value / SLIDER_HEIGHT));
      runOnJS(applyVolume)(pct);
    });

  const volumeTapGesture = Gesture.Tap()
    .onEnd((e) => {
      const fill = Math.max(0, Math.min(SLIDER_HEIGHT, SLIDER_HEIGHT - e.y));
      volumeFill.value = fill;
      const pct = Math.max(0, Math.min(1, fill / SLIDER_HEIGHT));
      runOnJS(applyVolume)(pct);
    });

  const volumeGesture = Gesture.Exclusive(volumeTapGesture, volumePanGesture);

  const brightnessFillStyle = useAnimatedStyle(() => ({
    height: brightnessFill.value,
  }));

  const volumeFillStyle = useAnimatedStyle(() => ({
    height: volumeFill.value,
  }));

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Backdrop — tap to close */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} accessibilityLabel="Close Control Center" accessibilityRole="button" />
      </Animated.View>

      {/* Control Center sheet */}
      <GestureDetector gesture={swipeDownGesture}>
        <Animated.View
          style={[styles.sheet, { paddingBottom: insets.bottom + 16 }, sheetStyle]}
        >
          <BlurView intensity={80} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />

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
                activeColor={colors.accent}
                textScale={textScale}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  update('airplaneMode', !settings.airplaneMode);
                }}
              />
              <ToggleButton
                iconName="wifi-outline"
                label="Wi-Fi"
                sublabel={device.wifi.enabled ? (device.wifi.ssid || 'On') : 'Off'}
                active={device.wifi.enabled}
                activeColor={colors.accent}
                textScale={textScale}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); device.toggleWifi(); }}
              />
              <ToggleButton
                iconName="bluetooth-outline"
                label="Bluetooth"
                sublabel={device.bluetooth.enabled ? 'On' : 'Off'}
                active={device.bluetooth.enabled}
                activeColor={colors.accent}
                textScale={textScale}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); device.toggleBluetooth(); }}
              />
              <ToggleButton
                iconName="moon-outline"
                label="Focus"
                sublabel={settings.focusMode !== 'off' ? 'Do Not Disturb' : 'Off'}
                active={settings.focusMode !== 'off'}
                activeColor={colors.systemPurple}
                textScale={textScale}
                onPress={toggleFocus}
              />
            </View>
          </View>

          {/* ------------------------------------------------------------ */}
          {/* Music controls                                                  */}
          {/* ------------------------------------------------------------ */}
          <View style={styles.section}>
            <View style={styles.musicCard}>
              <BlurView intensity={25} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
              <View style={styles.musicInner}>
                <View style={styles.musicAlbumArt}>
                  <Ionicons name="musical-notes-outline" size={28} color="rgba(255,255,255,0.4)" />
                </View>
                <View style={styles.musicMeta}>
                  <Text style={[styles.musicTitle, { fontSize: 14 * textScale }]} numberOfLines={1}>
                    {nowPlaying.title || 'Not Playing'}
                  </Text>
                  <Text style={[styles.musicArtist, { fontSize: 13 * textScale }]} numberOfLines={1}>
                    {nowPlaying.artist || '—'}
                  </Text>
                </View>
                <View style={styles.musicControls}>
                  <Pressable
                    onPress={async () => {
                      const mod = await getLauncher();
                      if (mod) {
                        try { await mod.mediaPrev(); } catch { /* no-op */ }
                        setTimeout(refreshNowPlaying, 600);
                      }
                    }}
                    accessibilityLabel="Previous track"
                    accessibilityRole="button"
                    style={styles.musicBtn}
                  >
                    <Ionicons name="play-skip-back" size={20} color="#ffffff" />
                  </Pressable>
                  <Pressable
                    onPress={async () => {
                      const mod = await getLauncher();
                      if (mod) {
                        try {
                          const ok = await mod.mediaPlayPause();
                          if (ok) setNowPlaying((p) => ({ ...p, isPlaying: !p.isPlaying }));
                        } catch { /* no-op */ }
                        setTimeout(refreshNowPlaying, 600);
                      }
                    }}
                    accessibilityLabel={nowPlaying.isPlaying ? 'Pause' : 'Play'}
                    accessibilityRole="button"
                    style={styles.musicPlayBtn}
                  >
                    <Ionicons
                      name={nowPlaying.isPlaying ? 'pause' : 'play'}
                      size={22}
                      color="#ffffff"
                    />
                  </Pressable>
                  <Pressable
                    onPress={async () => {
                      const mod = await getLauncher();
                      if (mod) {
                        try { await mod.mediaNext(); } catch { /* no-op */ }
                        setTimeout(refreshNowPlaying, 600);
                      }
                    }}
                    accessibilityLabel="Next track"
                    accessibilityRole="button"
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
                <Ionicons name="sunny-outline" size={14} color="rgba(255,255,255,0.6)" style={{ marginBottom: 6 }} />
                <GestureDetector gesture={brightnessGesture}>
                  <Animated.View
                    style={styles.verticalSliderTrack}
                    accessibilityLabel="Brightness control"
                    accessibilityRole="adjustable"
                  >
                    <Animated.View
                      style={[styles.verticalSliderFill, brightnessFillStyle]}
                    />
                    <Ionicons
                      name="sunny-outline"
                      size={16}
                      color="rgba(255,255,255,0.8)"
                      style={styles.verticalSliderIconBottom}
                    />
                  </Animated.View>
                </GestureDetector>
                <Text style={[styles.verticalSliderLabel, { fontSize: 11 * textScale }]}>Brightness</Text>
              </View>

              {/* Volume */}
              <View style={styles.verticalSliderWrap}>
                <Ionicons name="volume-high-outline" size={14} color="rgba(255,255,255,0.6)" style={{ marginBottom: 6 }} />
                <GestureDetector gesture={volumeGesture}>
                  <Animated.View
                    style={styles.verticalSliderTrack}
                    accessibilityLabel="Volume control"
                    accessibilityRole="adjustable"
                  >
                    <Animated.View
                      style={[styles.verticalSliderFill, volumeFillStyle]}
                    />
                    <Ionicons
                      name="volume-low-outline"
                      size={16}
                      color="rgba(255,255,255,0.8)"
                      style={styles.verticalSliderIconBottom}
                    />
                  </Animated.View>
                </GestureDetector>
                <Text style={[styles.verticalSliderLabel, { fontSize: 11 * textScale }]}>Volume</Text>
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
                textScale={textScale}
                onPress={toggleFlashlight}
                accessibilityLabel={flashlightOn ? 'Turn off torch' : 'Turn on torch'}
              />
              <ShortcutButton
                iconName="radio-button-on"
                label="Screen Rec"
                textScale={textScale}
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const mod = await getLauncher();
                  if (mod) {
                    await mod.openSystemSettings('cast');
                  } else {
                    alert('Screen Recording', 'Could not open screen recorder settings.');
                  }
                }}
                accessibilityLabel="Open Screen Recording"
              />
              <ShortcutButton
                iconName="calculator-outline"
                label="Calculator"
                textScale={textScale}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); launchCalculator(); }}
                accessibilityLabel="Open Calculator"
              />
              <ShortcutButton
                iconName="camera-outline"
                label="Camera"
                textScale={textScale}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); launchCamera(); }}
                accessibilityLabel="Open Camera"
              />
              <ShortcutButton
                iconName="share-social-outline"
                label="Nearby Share"
                textScale={textScale}
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const mod = await getLauncher();
                  if (mod) {
                    try {
                      // Try to open Nearby Share system panel; fall back to general settings
                      await mod.openSystemSettings('nearby_share');
                    } catch {
                      try {
                        await mod.openSystemSettings('settings');
                      } catch {
                        alert('Nearby Share', 'Opening Nearby Share...');
                      }
                    }
                  } else {
                    alert('Nearby Share', 'Opening Nearby Share...');
                  }
                }}
                accessibilityLabel="Open Nearby Share"
              />
            </View>
          </View>

          {/* ------------------------------------------------------------ */}
          {/* Screen mirroring tile                                           */}
          {/* ------------------------------------------------------------ */}
          <View style={styles.section}>
            <Pressable
              style={styles.mirrorTile}
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const mod = await getLauncher();
                if (mod) {
                  await mod.openSystemSettings('cast');
                } else {
                  alert('Screen Mirroring', 'Could not open cast settings.');
                }
              }}
              accessibilityLabel="Screen Mirroring"
              accessibilityRole="button"
            >
              <BlurView intensity={25} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
              <View style={styles.mirrorInner}>
                <Ionicons name="tv-outline" size={18} color="#ffffff" />
                <Text style={[styles.mirrorLabel, { fontSize: 14 * textScale }]}>Screen Mirroring</Text>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color="rgba(255,255,255,0.7)"
                  style={{ marginLeft: 'auto' as unknown as number }}
                />
              </View>
            </Pressable>
          </View>

          {/* Battery info row */}
          <View style={[styles.section, styles.batteryInfoRow]}>
            <Ionicons
              name={device.battery.isCharging ? 'battery-charging-outline' : 'battery-half-outline'}
              size={16}
              color="rgba(255,255,255,0.6)"
            />
            <Text style={[styles.batteryInfoText, { fontSize: 12 * textScale }]}>
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
    marginBottom: 8,
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
    color: 'rgba(255,255,255,0.7)',
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
    color: 'rgba(255,255,255,0.7)',
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
    color: 'rgba(255,255,255,0.75)',
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
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '400',
  },
});
