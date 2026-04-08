import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

const getLauncher = async () => {
  try {
    return (await import('../../modules/launcher-module/src')).default;
  } catch {
    return null; // Expected: module unavailable on non-Android
  }
};

// ---------------------------------------------------------------------------
// Control button
// ---------------------------------------------------------------------------

interface ControlButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
}

function ControlButton({ icon, label, onPress, active }: ControlButtonProps) {
  return (
    <Pressable
      style={[styles.controlBtn, active && styles.controlBtnActive]}
      onPress={onPress}
      android_ripple={{ color: 'rgba(255,255,255,0.15)', radius: 35 }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={28} color="#ffffff" />
      <Text style={styles.controlLabel}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// CallScreen
// ---------------------------------------------------------------------------

export function CallScreen({
  navigation,
  route,
}: {
  navigation: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  route: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const insets = useSafeAreaInsets();
  const { number, name } = (route.params ?? {}) as { number: string; name?: string };
  const displayName = name || number || 'Unknown';

  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);

  // Pulsing animation while the call is being placed
  const pulseScale = useSharedValue(1);
  const pulseGlow = useSharedValue(0);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 800 }),
        withTiming(1.0, { duration: 800 }),
      ),
      -1,
      false,
    );
    pulseGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0, { duration: 800 }),
      ),
      -1,
      false,
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pulseAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    shadowOpacity: pulseGlow.value * 0.7,
    shadowRadius: 8 + pulseGlow.value * 16,
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 0 },
    elevation: pulseGlow.value * 12,
  }));

  // Initiate the native call on mount
  useEffect(() => {
    (async () => {
      const mod = await getLauncher();
      if (mod && number) {
        try {
          await mod.makeCall(number);
        } catch (e) { console.warn('CallScreen: native call failed:', e); }
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEndCall = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.goBack();
  }, [navigation]);

  const toggleMute = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsMuted((v) => !v);
  }, []);

  const toggleSpeaker = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsSpeaker((v) => !v);
  }, []);


  return (
    <LinearGradient
      colors={['#1a1a2e', '#16213e']}
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* ------------------------------------------------------------------ */}
      {/* Contact info                                                         */}
      {/* ------------------------------------------------------------------ */}
      <View style={styles.contactSection}>
        {/* Avatar — pulses when in calling/incoming state */}
        <Animated.View style={[styles.avatarCircle, pulseAnimStyle]}>
          <Text style={styles.avatarInitials}>{getInitials(displayName)}</Text>
        </Animated.View>

        {/* Name */}
        <Text style={styles.callerName} numberOfLines={1} adjustsFontSizeToFit>
          {displayName}
        </Text>

        {/* Status */}
        <Text style={styles.callStatus}>Calling...</Text>
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Control buttons                                                      */}
      {/* ------------------------------------------------------------------ */}
      <View style={styles.controlsGrid}>
        <View style={styles.controlsRow}>
          <ControlButton
            icon={isMuted ? 'mic-off' : 'mic'}
            label="Mute"
            onPress={toggleMute}
            active={isMuted}
          />
          <ControlButton
            icon={isSpeaker ? 'volume-high' : 'volume-medium'}
            label="Speaker"
            onPress={toggleSpeaker}
            active={isSpeaker}
          />
        </View>
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* End Call button                                                       */}
      {/* ------------------------------------------------------------------ */}
      <View style={styles.endCallRow}>
        <Pressable
          style={styles.endCallBtn}
          onPress={handleEndCall}
          android_ripple={{ color: 'rgba(255,255,255,0.2)', radius: 35 }}
          accessibilityRole="button"
          accessibilityLabel="End Call"
        >
          <Ionicons name="call" size={32} color="#ffffff" style={styles.endCallIcon} />
        </Pressable>
      </View>
    </LinearGradient>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },

  // Contact section
  contactSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 24,
  },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  avatarInitials: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: '300',
    letterSpacing: 1,
  },
  callerName: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '300',
    letterSpacing: 0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  callStatus: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    fontWeight: '400',
  },

  // Controls grid
  controlsGrid: {
    width: '100%',
    marginBottom: 32,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  controlBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  controlBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  controlLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },

  // End call
  endCallRow: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  endCallBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  endCallIcon: {
    transform: [{ rotate: '135deg' }],
  },
});
