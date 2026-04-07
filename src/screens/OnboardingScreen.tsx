import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { SystemColors } from '../theme/CupertinoTheme';

const getLauncher = async () => {
  try {
    return (await import('../../modules/launcher-module/src')).default;
  } catch {
    return null; // Expected: module unavailable on non-Android
  }
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface OnboardingScreenProps {
  onDone: () => void;
}

const PERMISSIONS = [
  {
    icon: 'people' as const,
    label: 'Contacts',
    description: 'See your real contacts',
  },
  {
    icon: 'call' as const,
    label: 'Phone',
    description: 'Make calls and see call history',
  },
  {
    icon: 'chatbubble' as const,
    label: 'Messages',
    description: 'Read and send SMS',
  },
  {
    icon: 'camera' as const,
    label: 'Camera',
    description: 'Use flashlight and take photos',
  },
  {
    icon: 'location' as const,
    label: 'Location',
    description: 'See nearby WiFi networks',
  },
  {
    icon: 'calendar' as const,
    label: 'Calendar',
    description: 'View upcoming events',
  },
];

export function OnboardingScreen({ onDone }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [permissionResults, setPermissionResults] = useState<Record<string, boolean>>({});
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const goToPage = useCallback((page: number) => {
    scrollRef.current?.scrollTo({ x: page * SCREEN_WIDTH, animated: true });
    setCurrentPage(page);
  }, []);

  const handleGrantPermissions = useCallback(async () => {
    const mod = await getLauncher();
    if (mod) {
      try {
        setPermissionError(null);
        await mod.requestAllPermissions();
        const results = await mod.checkPermissions();
        setPermissionResults(results);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to request permissions';
        setPermissionError(msg);
        // Still check what was granted
        try {
          const results = await mod.checkPermissions();
          setPermissionResults(results);
        } catch { /* Expected: checkPermissions may fail after partial grant */ }
      }
    }
    goToPage(2);
  }, [goToPage]);

  const handleSetLauncher = useCallback(async () => {
    const mod = await getLauncher();
    if (mod) {
      try {
        await (mod as any).openLauncherSettings?.();
      } catch { /* Expected: openLauncherSettings may not exist on all devices */ }
    }
    goToPage(3);
  }, [goToPage]);

  const handleDone = useCallback(async () => {
    await AsyncStorage.setItem('@iostoandroid/onboarding_done', 'true');
    onDone();
  }, [onDone]);

  return (
    <LinearGradient
      colors={['#1a1a2e', '#16213e', '#0f3460']}
      style={styles.root}
    >
      {/* Page dots */}
      <View style={[styles.dotsContainer, { top: insets.top + 16 }]}>
        {[0, 1, 2, 3].map(i => (
          <View
            key={i}
            style={[
              styles.dot,
              i === currentPage ? styles.dotActive : styles.dotInactive,
            ]}
          />
        ))}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => {
          const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setCurrentPage(page);
        }}
      >
        {/* ── Page 1: Welcome ──────────────────────────────────────────── */}
        <View style={[styles.page, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.iconWrap}>
            <BlurView intensity={20} tint="light" experimentalBlurMethod="dimezisBlurView" style={styles.iconBlur}>
              <Ionicons name="phone-portrait" size={72} color="#FFFFFF" />
            </BlurView>
          </View>
          <Text style={styles.pageTitle}>Welcome to{'\n'}iOS Launcher</Text>
          <Text style={styles.pageSubtitle}>Transform your Android into iOS</Text>
          <Pressable style={styles.primaryButton} onPress={() => goToPage(1)}>
            <Text style={styles.primaryButtonText}>Get Started</Text>
          </Pressable>
        </View>

        {/* ── Page 2: Permissions ───────────────────────────────────────── */}
        <View style={[styles.page, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 32 }]}>
          <Text style={styles.pageTitle}>Permissions</Text>
          <Text style={styles.pageSubtitle}>We need a few permissions to give you the full experience</Text>
          <View style={styles.permList}>
            {PERMISSIONS.map(perm => (
              <View key={perm.label} style={styles.permRow}>
                <View style={styles.permIconWrap}>
                  <Ionicons name={perm.icon} size={22} color="#FFFFFF" />
                </View>
                <View style={styles.permText}>
                  <Text style={styles.permLabel}>{perm.label}</Text>
                  <Text style={styles.permDesc}>{perm.description}</Text>
                </View>
              </View>
            ))}
          </View>
          {permissionError && (
            <View style={styles.errorContainer}>
              <Ionicons name="warning" size={18} color="#FF453A" />
              <Text style={styles.errorText}>{permissionError}</Text>
            </View>
          )}
          <Pressable style={styles.primaryButton} onPress={handleGrantPermissions}>
            <Text style={styles.primaryButtonText}>
              {permissionError ? 'Try Again' : 'Grant Permissions'}
            </Text>
          </Pressable>
        </View>

        {/* ── Page 3: Default Launcher ─────────────────────────────────── */}
        <View style={[styles.page, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.iconWrap}>
            <BlurView intensity={20} tint="light" experimentalBlurMethod="dimezisBlurView" style={styles.iconBlur}>
              <Ionicons name="phone-portrait-outline" size={64} color="#FFFFFF" />
              <Ionicons
                name="square"
                size={22}
                color="#FFFFFF"
                style={styles.homeButtonIcon}
              />
            </BlurView>
          </View>
          <Text style={styles.pageTitle}>Set as Default{'\n'}Launcher</Text>
          <Text style={styles.pageSubtitle}>
            To get the full experience, set this app as your home launcher
          </Text>
          <Pressable style={styles.primaryButton} onPress={handleSetLauncher}>
            <Text style={styles.primaryButtonText}>Set Now</Text>
          </Pressable>
          <Pressable onPress={() => goToPage(3)} hitSlop={12} style={{ marginTop: 16 }}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </View>

        {/* ── Page 4: Ready ─────────────────────────────────────────────── */}
        <View style={[styles.page, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={72} color="#FFFFFF" />
          </View>
          <Text style={styles.pageTitle}>{"You're All Set!"}</Text>
          <Text style={styles.pageSubtitle}>Your iOS experience starts now</Text>

          {/* Permission status summary */}
          {Object.keys(permissionResults).length > 0 && (
            <View style={styles.permSummary}>
              {Object.entries(permissionResults).map(([key, granted]) => (
                <View key={key} style={styles.permStatusRow}>
                  <Ionicons
                    name={granted ? 'checkmark-circle' : 'close-circle'}
                    size={18}
                    color={granted ? '#30D158' : '#FF453A'}
                  />
                  <Text style={styles.permStatusLabel}>{key}</Text>
                </View>
              ))}
            </View>
          )}

          <Pressable style={styles.primaryButton} onPress={handleDone}>
            <Text style={styles.primaryButtonText}>Start</Text>
          </Pressable>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  dotsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    zIndex: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
  },
  dotInactive: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  page: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
    minHeight: SCREEN_HEIGHT,
  },
  iconWrap: {
    marginBottom: 8,
    borderRadius: 32,
    overflow: 'hidden',
  },
  iconBlur: {
    width: 130,
    height: 130,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  homeButtonIcon: {
    position: 'absolute',
    bottom: 14,
    opacity: 0.8,
  },
  checkCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#30D158',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  pageTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 40,
    letterSpacing: 0.3,
  },
  pageSubtitle: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: SystemColors.dark.accent,
    borderRadius: 14,
    paddingHorizontal: 48,
    paddingVertical: 15,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  skipText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 15,
    fontWeight: '500',
  },
  permList: {
    alignSelf: 'stretch',
    gap: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 14,
  },
  permIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: SystemColors.dark.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permText: {
    flex: 1,
  },
  permLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  permDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,69,58,0.15)',
    borderRadius: 10,
    padding: 12,
    alignSelf: 'stretch',
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#FF453A',
  },
  permSummary: {
    alignSelf: 'stretch',
    gap: 6,
    marginTop: 4,
    marginBottom: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 14,
  },
  permStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  permStatusLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'capitalize',
  },
});
