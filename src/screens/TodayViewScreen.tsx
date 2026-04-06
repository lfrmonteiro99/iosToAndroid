/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  StatusBar,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

import { useDevice } from '../store/DeviceStore';
import { useTheme } from '../theme/ThemeContext';

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(date: Date): string {
  return `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

// ---------------------------------------------------------------------------
// Widget base card
// ---------------------------------------------------------------------------

interface WidgetCardProps {
  children: React.ReactNode;
  style?: object;
}

function WidgetCard({ children, style }: WidgetCardProps) {
  return (
    <View style={[styles.widgetCard, style]}>
      <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.widgetContent}>{children}</View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Progress bar (minimal, no external dep)
// ---------------------------------------------------------------------------

function ProgressBar({ value, color = '#0A84FF' }: { value: number; color?: string }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.round(value * 100)}%` as any, backgroundColor: color }]} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Battery Widget
// ---------------------------------------------------------------------------

function BatteryWidget({ level, isCharging }: { level: number; isCharging: boolean }) {
  const pct = Math.round(level * 100);
  const color = pct > 20 ? '#30D158' : '#FF453A';
  const iconName: keyof typeof Ionicons.glyphMap = isCharging ? 'battery-charging' : (pct > 50 ? 'battery-full' : pct > 20 ? 'battery-half' : 'battery-dead');

  return (
    <WidgetCard>
      <View style={styles.widgetRow}>
        <Ionicons name={iconName} size={28} color={color} />
        <Text style={styles.widgetTitle}>Battery</Text>
      </View>
      <Text style={[styles.widgetBigNumber, { color }]}>{pct}%</Text>
      <ProgressBar value={level} color={color} />
      <Text style={styles.widgetSubtext}>
        {isCharging ? 'Charging' : 'On battery'}
      </Text>
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Storage Widget
// ---------------------------------------------------------------------------

function StorageWidget({
  usedGB,
  totalGB,
  usedPercentage,
}: {
  usedGB: string;
  totalGB: string;
  usedPercentage: number;
}) {
  const pct = usedPercentage / 100;
  const color = pct > 0.85 ? '#FF453A' : pct > 0.65 ? '#FF9F0A' : '#0A84FF';

  return (
    <WidgetCard>
      <View style={styles.widgetRow}>
        <Ionicons name="server-outline" size={22} color={color} />
        <Text style={styles.widgetTitle}>Storage</Text>
      </View>
      <View style={styles.storageRow}>
        <Text style={styles.widgetBigNumber}>{usedGB} GB</Text>
        <Text style={styles.widgetSubtext}> / {totalGB} GB used</Text>
      </View>
      <ProgressBar value={pct} color={color} />
      <Text style={styles.widgetSubtext}>{Math.round(usedPercentage)}% full</Text>
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Weather Widget (static placeholder)
// ---------------------------------------------------------------------------

function WeatherWidget() {
  return (
    <WidgetCard>
      <View style={styles.widgetRow}>
        <Ionicons name="partly-sunny-outline" size={22} color="#FFD60A" />
        <Text style={styles.widgetTitle}>Weather</Text>
      </View>
      <View style={styles.weatherRow}>
        <Text style={styles.weatherTemp}>22°C</Text>
        <Text style={styles.weatherDesc}>Partly Cloudy</Text>
      </View>
      <Text style={styles.widgetSubtext}>H: 25°  L: 18°</Text>
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Screen Time Widget (static placeholder)
// ---------------------------------------------------------------------------

function ScreenTimeWidget() {
  return (
    <WidgetCard>
      <View style={styles.widgetRow}>
        <Ionicons name="time-outline" size={22} color="#BF5AF2" />
        <Text style={styles.widgetTitle}>Screen Time</Text>
      </View>
      <Text style={[styles.widgetBigNumber, { color: '#BF5AF2' }]}>2h 34m</Text>
      <Text style={styles.widgetSubtext}>today · 18% more than yesterday</Text>
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Up Next Widget (static placeholder)
// ---------------------------------------------------------------------------

function UpNextWidget() {
  return (
    <WidgetCard>
      <View style={styles.widgetRow}>
        <Ionicons name="calendar-outline" size={22} color="#FF9F0A" />
        <Text style={styles.widgetTitle}>Up Next</Text>
      </View>
      <View style={styles.upNextBody}>
        <Ionicons name="calendar" size={36} color="rgba(255,255,255,0.2)" />
        <Text style={styles.upNextText}>No upcoming events</Text>
      </View>
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Messages Widget
// ---------------------------------------------------------------------------

function MessagesWidget({ unreadCount }: { unreadCount: number }) {
  return (
    <WidgetCard>
      <View style={styles.widgetRow}>
        <Ionicons name="chatbubble-ellipses-outline" size={22} color="#30D158" />
        <Text style={styles.widgetTitle}>Messages</Text>
      </View>
      {unreadCount > 0 ? (
        <>
          <Text style={[styles.widgetBigNumber, { color: '#30D158' }]}>{unreadCount}</Text>
          <Text style={styles.widgetSubtext}>unread message{unreadCount !== 1 ? 's' : ''}</Text>
        </>
      ) : (
        <Text style={styles.widgetSubtext}>No unread messages</Text>
      )}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export function TodayViewScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const device = useDevice();

  const today = useMemo(() => formatDate(new Date()), []);

  const unreadCount = useMemo(
    () => device.messages.filter((m) => !m.isRead && m.type === 1).length,
    [device.messages],
  );

  // Swipe-left gesture to dismiss
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  const handleClose = () => navigation.goBack();

  const swipeLeftGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationX < 0) {
        translateX.value = e.translationX;
        opacity.value = Math.max(0, 1 + e.translationX / 300);
      }
    })
    .onEnd((e) => {
      if (e.translationX < -80 || e.velocityX < -600) {
        translateX.value = withTiming(-400, { duration: 250 });
        opacity.value = withTiming(0, { duration: 250 }, () => runOnJS(handleClose)());
      } else {
        translateX.value = withTiming(0, { duration: 200 });
        opacity.value = withTiming(1, { duration: 200 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Full-screen dark backdrop — tap to dismiss */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />

      <GestureDetector gesture={swipeLeftGesture}>
        <Animated.View style={[styles.panel, sheetStyle]}>
          {/* Translucent blur background */}
          <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />

          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Date header */}
            <Text style={styles.dateText}>{today}</Text>

            {/* Widgets */}
            <BatteryWidget
              level={device.battery.level}
              isCharging={device.battery.isCharging}
            />

            <StorageWidget
              usedGB={device.storage.usedGB}
              totalGB={device.storage.totalGB}
              usedPercentage={device.storage.usedPercentage}
            />

            <WeatherWidget />

            <ScreenTimeWidget />

            <UpNextWidget />

            <MessagesWidget unreadCount={unreadCount} />
          </ScrollView>
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
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  panel: {
    flex: 1,
    overflow: 'hidden',
  },
  scrollContent: {
    paddingHorizontal: 16,
  },

  // Date header
  dateText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 20,
  },

  // Widget card
  widgetCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: 'rgba(30,30,35,0.6)',
  },
  widgetContent: {
    padding: 16,
  },

  // Widget internals
  widgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  widgetTitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.2,
    textTransform: 'uppercase',
  },
  widgetBigNumber: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 6,
  },
  widgetSubtext: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '400',
    marginTop: 6,
  },

  // Progress bar
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },

  // Storage
  storageRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 6,
  },

  // Weather
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    marginBottom: 4,
  },
  weatherTemp: {
    color: '#ffffff',
    fontSize: 40,
    fontWeight: '200',
    letterSpacing: -1,
  },
  weatherDesc: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontWeight: '400',
  },

  // Up Next
  upNextBody: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  upNextText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    fontWeight: '400',
  },
});
