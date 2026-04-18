/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { useDevice } from '../store/DeviceStore';
import { useTheme } from '../theme/ThemeContext';

// ---------------------------------------------------------------------------
// Widget configuration types & storage
// ---------------------------------------------------------------------------

type WidgetType = 'battery' | 'storage' | 'weather' | 'upNext' | 'messages' | 'screenTime';

const ALL_WIDGET_TYPES: WidgetType[] = ['battery', 'storage', 'weather', 'upNext', 'messages', 'screenTime'];
const DEFAULT_ENABLED: WidgetType[] = ['battery', 'weather', 'storage', 'upNext', 'messages'];
const WIDGET_CONFIG_KEY = '@iostoandroid/widget_config';

const WIDGET_LABELS: Record<WidgetType, string> = {
  battery: 'Battery',
  storage: 'Storage',
  weather: 'Weather',
  upNext: 'Up Next',
  messages: 'Messages',
  screenTime: 'Screen Time',
};

const WIDGET_ICONS: Record<WidgetType, keyof typeof Ionicons.glyphMap> = {
  battery: 'battery-full',
  storage: 'server-outline',
  weather: 'partly-sunny-outline',
  upNext: 'calendar-outline',
  messages: 'chatbubble-ellipses-outline',
  screenTime: 'hourglass-outline',
};

async function loadWidgetConfig(): Promise<WidgetType[]> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WidgetType[];
      // Validate: only keep known types
      return parsed.filter((t) => ALL_WIDGET_TYPES.includes(t));
    }
  } catch {
    // fall through
  }
  return DEFAULT_ENABLED;
}

async function saveWidgetConfig(config: WidgetType[]): Promise<void> {
  await AsyncStorage.setItem(WIDGET_CONFIG_KEY, JSON.stringify(config));
}

function useWidgetConfig() {
  const [enabled, setEnabled] = useState<WidgetType[]>(DEFAULT_ENABLED);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadWidgetConfig().then((cfg) => {
      setEnabled(cfg);
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((next: WidgetType[]) => {
    setEnabled(next);
    saveWidgetConfig(next);
  }, []);

  return { enabled, setEnabled: persist, loaded };
}

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
  onPress?: () => void;
}

function WidgetCard({ children, style, onPress }: WidgetCardProps) {
  if (onPress) {
    return (
      <Pressable
        style={[styles.widgetCard, style]}
        onPress={onPress}
        android_ripple={{ color: 'rgba(255,255,255,0.1)', borderless: false }}
      >
        <BlurView intensity={55} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        <View style={styles.widgetContent}>{children}</View>
      </Pressable>
    );
  }
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

function ProgressBar({ value, color }: { value: number; color?: string }) {
  const { theme } = useTheme();
  const barColor = color ?? theme.colors.accent;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.round(value * 100)}%` as any, backgroundColor: barColor }]} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Battery Widget
// ---------------------------------------------------------------------------

function BatteryWidget({ level, isCharging, onPress }: { level: number; isCharging: boolean; onPress?: () => void }) {
  const { textScale } = useTheme();
  const pct = Math.round(level * 100);
  const color = pct > 20 ? '#30D158' : '#FF453A';
  const iconName: keyof typeof Ionicons.glyphMap = isCharging ? 'battery-charging' : (pct > 50 ? 'battery-full' : pct > 20 ? 'battery-half' : 'battery-dead');

  return (
    <WidgetCard onPress={onPress}>
      <View style={styles.widgetRow}>
        <Ionicons name={iconName} size={28} color={color} />
        <Text style={[styles.widgetTitle, { fontSize: 14 * textScale }]}>Battery</Text>
      </View>
      <Text style={[styles.widgetBigNumber, { color, fontSize: 36 * textScale }]}>{pct}%</Text>
      <ProgressBar value={level} color={color} />
      <Text style={[styles.widgetSubtext, { fontSize: 13 * textScale }]}>
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
  onPress,
}: {
  usedGB: string;
  totalGB: string;
  usedPercentage: number;
  onPress?: () => void;
}) {
  const { theme, textScale } = useTheme();
  const pct = usedPercentage / 100;
  const color = pct > 0.85 ? '#FF453A' : pct > 0.65 ? '#FF9F0A' : theme.colors.accent;

  return (
    <WidgetCard onPress={onPress}>
      <View style={styles.widgetRow}>
        <Ionicons name="server-outline" size={22} color={color} />
        <Text style={[styles.widgetTitle, { fontSize: 14 * textScale }]}>Storage</Text>
      </View>
      <View style={styles.storageRow}>
        <Text style={[styles.widgetBigNumber, { fontSize: 36 * textScale }]}>{usedGB} GB</Text>
        <Text style={[styles.widgetSubtext, { fontSize: 13 * textScale }]}> / {totalGB} GB used</Text>
      </View>
      <ProgressBar value={pct} color={color} />
      <Text style={[styles.widgetSubtext, { fontSize: 13 * textScale }]}>{Math.round(usedPercentage)}% full</Text>
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Weather Widget (live data from wttr.in)
// ---------------------------------------------------------------------------

function WeatherWidget({ temp, condition, icon, city }: { temp: number; condition: string; icon: string; city: string }) {
  const { textScale } = useTheme();
  const iconName = `${icon}-outline` as keyof typeof Ionicons.glyphMap;
  const isUnavailable = !condition;

  if (isUnavailable) {
    return (
      <WidgetCard>
        <View style={styles.widgetRow}>
          <Ionicons name="cloud-offline-outline" size={22} color="rgba(255,255,255,0.4)" />
          <Text style={[styles.widgetTitle, { fontSize: 14 * textScale }]}>Weather</Text>
        </View>
        <Text style={[styles.widgetSubtext, { fontSize: 15 * textScale, marginTop: 8 }]}>
          Unable to load weather
        </Text>
      </WidgetCard>
    );
  }

  return (
    <WidgetCard>
      <View style={styles.widgetRow}>
        <Ionicons name={iconName} size={22} color="#FFD60A" />
        <Text style={[styles.widgetTitle, { fontSize: 14 * textScale }]}>Weather</Text>
        {city ? <Text style={[styles.widgetTitle, { marginLeft: 'auto' as any, textTransform: 'none', fontSize: 14 * textScale }]}>{city}</Text> : null}
      </View>
      <View style={styles.weatherRow}>
        <Text style={styles.weatherTemp}>{temp}°C</Text>
        <Text style={[styles.weatherDesc, { fontSize: 16 * textScale }]}>{condition}</Text>
      </View>
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Up Next Widget (real calendar events)
// ---------------------------------------------------------------------------

interface CalendarEventItem {
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  location: string;
}

function formatEventTime(ts: number, allDay: boolean): string {
  if (allDay) return 'All day';
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function UpNextWidget({ events }: { events: CalendarEventItem[] }) {
  const { textScale } = useTheme();
  return (
    <WidgetCard>
      <View style={styles.widgetRow}>
        <Ionicons name="calendar-outline" size={22} color="#FF9F0A" />
        <Text style={[styles.widgetTitle, { fontSize: 14 * textScale }]}>Up Next</Text>
      </View>
      {events.length === 0 ? (
        <View style={styles.upNextBody}>
          <Ionicons name="calendar" size={36} color="rgba(255,255,255,0.2)" />
          <Text style={[styles.upNextText, { fontSize: 15 * textScale }]}>No upcoming events</Text>
        </View>
      ) : (
        events.slice(0, 3).map((ev) => (
          <View key={ev.id} style={styles.eventRow}>
            <View style={styles.eventDot} />
            <View style={styles.eventMeta}>
              <Text style={[styles.eventTitle, { fontSize: 14 * textScale }]} numberOfLines={1}>{ev.title}</Text>
              <Text style={[styles.eventTime, { fontSize: 12 * textScale }]}>{formatEventTime(ev.start, ev.allDay)}{ev.location ? `  ·  ${ev.location}` : ''}</Text>
            </View>
          </View>
        ))
      )}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Messages Widget
// ---------------------------------------------------------------------------

function MessagesWidget({ unreadCount, onPress }: { unreadCount: number; onPress?: () => void }) {
  const { textScale } = useTheme();
  return (
    <WidgetCard onPress={onPress}>
      <View style={styles.widgetRow}>
        <Ionicons name="chatbubble-ellipses-outline" size={22} color="#30D158" />
        <Text style={[styles.widgetTitle, { fontSize: 14 * textScale }]}>Messages</Text>
      </View>
      {unreadCount > 0 ? (
        <>
          <Text style={[styles.widgetBigNumber, { color: '#30D158', fontSize: 36 * textScale }]}>{unreadCount}</Text>
          <Text style={[styles.widgetSubtext, { fontSize: 13 * textScale }]}>unread message{unreadCount !== 1 ? 's' : ''}</Text>
        </>
      ) : (
        <Text style={[styles.widgetSubtext, { fontSize: 13 * textScale }]}>No unread messages</Text>
      )}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Screen Time Widget
// ---------------------------------------------------------------------------

function ScreenTimeWidget({ onPress }: { onPress?: () => void }) {
  const { textScale } = useTheme();
  return (
    <WidgetCard onPress={onPress}>
      <View style={styles.widgetRow}>
        <Ionicons name="hourglass-outline" size={22} color="#BF5AF2" />
        <Text style={[styles.widgetTitle, { fontSize: 14 * textScale }]}>Screen Time</Text>
      </View>
      <Text style={[styles.widgetSubtext, { fontSize: 13 * textScale }]}>Tap to view screen time details</Text>
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Edit-mode row for a single widget
// ---------------------------------------------------------------------------

function EditableWidgetRow({
  widgetType,
  isEnabled,
  onToggle,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  widgetType: WidgetType;
  isEnabled: boolean;
  onToggle: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const { textScale } = useTheme();
  return (
    <View style={styles.editRow}>
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        style={styles.editToggleBtn}
      >
        <Ionicons
          name={isEnabled ? 'remove-circle' : 'add-circle'}
          size={24}
          color={isEnabled ? '#FF453A' : '#30D158'}
        />
      </Pressable>

      <Ionicons name={WIDGET_ICONS[widgetType]} size={20} color="rgba(255,255,255,0.7)" />
      <Text style={[styles.editLabel, { fontSize: 15 * textScale }]}>{WIDGET_LABELS[widgetType]}</Text>

      {isEnabled && (
        <View style={styles.editReorderGroup}>
          <Pressable onPress={onMoveUp} disabled={isFirst} hitSlop={6} style={styles.editArrowBtn}>
            <Ionicons name="chevron-up" size={20} color={isFirst ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.7)'} />
          </Pressable>
          <Pressable onPress={onMoveDown} disabled={isLast} hitSlop={6} style={styles.editArrowBtn}>
            <Ionicons name="chevron-down" size={20} color={isLast ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.7)'} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Edit Widgets Panel
// ---------------------------------------------------------------------------

function EditWidgetsPanel({
  enabled,
  onSave,
}: {
  enabled: WidgetType[];
  onSave: (next: WidgetType[]) => void;
}) {
  const { textScale } = useTheme();
  const [draft, setDraft] = useState<WidgetType[]>(enabled);

  const disabled = ALL_WIDGET_TYPES.filter((t) => !draft.includes(t));

  const toggle = (w: WidgetType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (draft.includes(w)) {
      setDraft(draft.filter((t) => t !== w));
    } else {
      setDraft([...draft, w]);
    }
  };

  const moveUp = (idx: number) => {
    if (idx <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = [...draft];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setDraft(next);
  };

  const moveDown = (idx: number) => {
    if (idx >= draft.length - 1) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = [...draft];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setDraft(next);
  };

  return (
    <View style={styles.editPanel}>
      <Text style={[styles.editSectionHeader, { fontSize: 12 * textScale }]}>Enabled Widgets</Text>
      {draft.map((w, i) => (
        <EditableWidgetRow
          key={w}
          widgetType={w}
          isEnabled
          onToggle={() => toggle(w)}
          onMoveUp={() => moveUp(i)}
          onMoveDown={() => moveDown(i)}
          isFirst={i === 0}
          isLast={i === draft.length - 1}
        />
      ))}
      {draft.length === 0 && (
        <Text style={[styles.editEmptyText, { fontSize: 14 * textScale }]}>No widgets enabled</Text>
      )}

      {disabled.length > 0 && (
        <>
          <Text style={[styles.editSectionHeader, { marginTop: 18, fontSize: 12 * textScale }]}>Available Widgets</Text>
          {disabled.map((w) => (
            <EditableWidgetRow
              key={w}
              widgetType={w}
              isEnabled={false}
              onToggle={() => toggle(w)}
            />
          ))}
        </>
      )}

      <View style={styles.editButtonRow}>
        <Pressable style={styles.editDoneBtn} onPress={() => onSave(draft)}>
          <Text style={[styles.editDoneBtnText, { fontSize: 16 * textScale }]}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export function TodayViewScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const device = useDevice();
  const { textScale } = useTheme();
  const nav = useNavigation<any>(); // eslint-disable-line @typescript-eslint/no-explicit-any

  const today = useMemo(() => formatDate(new Date()), []);

  const unreadCount = useMemo(
    () => device.messages.filter((m) => !m.isRead && m.type === 1).length,
    [device.messages],
  );

  const [calendarEvents, setCalendarEvents] = React.useState<CalendarEventItem[]>([]);

  React.useEffect(() => {
    (async () => {
      try {
        const mod = (await import('../../modules/launcher-module/src')).default;
        const events = await mod.getCalendarEvents(7);
        setCalendarEvents(events as CalendarEventItem[]);
      } catch {
        // permission not granted or unavailable — leave empty
      }
    })();
  }, []);

  // Widget configuration
  const { enabled, setEnabled, loaded } = useWidgetConfig();
  const [editMode, setEditMode] = useState(false);

  const handleSaveEdit = useCallback(
    (next: WidgetType[]) => {
      setEnabled(next);
      setEditMode(false);
    },
    [setEnabled],
  );

  // Map of widget type -> rendered JSX
  const widgetMap: Record<WidgetType, React.ReactNode> = useMemo(
    () => ({
      battery: (
        <BatteryWidget
          key="battery"
          level={device.battery.level}
          isCharging={device.battery.isCharging}
          onPress={() => nav.navigate('Battery')}
        />
      ),
      storage: (
        <StorageWidget
          key="storage"
          usedGB={device.storage.usedGB}
          totalGB={device.storage.totalGB}
          usedPercentage={device.storage.usedPercentage}
          onPress={() => nav.navigate('Storage')}
        />
      ),
      weather: (
        <WeatherWidget
          key="weather"
          temp={device.weather.temp}
          condition={device.weather.condition}
          icon={device.weather.icon}
          city={device.weather.city}
        />
      ),
      upNext: <UpNextWidget key="upNext" events={calendarEvents} />,
      messages: (
        <MessagesWidget
          key="messages"
          unreadCount={unreadCount}
          onPress={() => nav.navigate('Messages')}
        />
      ),
      screenTime: (
        <ScreenTimeWidget
          key="screenTime"
          onPress={() => nav.navigate('ScreenTime')}
        />
      ),
    }),
    [device, calendarEvents, unreadCount, nav],
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
          <BlurView intensity={70} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />

          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Date header */}
            <Text style={[styles.dateText, { fontSize: 28 * textScale }]}>{today}</Text>

            {/* Widgets — rendered in configured order */}
            {editMode ? (
              <EditWidgetsPanel
                enabled={enabled}
                onSave={handleSaveEdit}
              />
            ) : (
              <>
                {loaded && enabled.map((type) => widgetMap[type])}

                {/* Edit button */}
                <Pressable
                  style={styles.editOpenBtn}
                  onPress={() => setEditMode(true)}
                >
                  <Ionicons name="pencil-outline" size={16} color="rgba(255,255,255,0.6)" />
                  <Text style={[styles.editOpenBtnText, { fontSize: 14 * textScale }]}>Edit Widgets</Text>
                </Pressable>
              </>
            )}
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

  // Event rows
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 8,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF9F0A',
    marginTop: 4,
  },
  eventMeta: {
    flex: 1,
  },
  eventTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  eventTime: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '400',
    marginTop: 2,
  },

  // Edit button (bottom of widget list)
  editOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  editOpenBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '500',
  },

  // Edit panel
  editPanel: {
    marginBottom: 8,
  },
  editSectionHeader: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  editToggleBtn: {
    width: 28,
    alignItems: 'center',
  },
  editLabel: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
  editReorderGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  editArrowBtn: {
    padding: 4,
  },
  editEmptyText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    paddingVertical: 16,
  },
  editButtonRow: {
    marginTop: 18,
    alignItems: 'center',
  },
  editDoneBtn: {
    backgroundColor: 'rgba(10,132,255,0.9)',
    paddingHorizontal: 48,
    paddingVertical: 12,
    borderRadius: 14,
  },
  editDoneBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
