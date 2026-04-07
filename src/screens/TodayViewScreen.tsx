/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

import { useDevice } from '../store/DeviceStore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'todayview_widget_config';

const ALL_WIDGET_IDS = ['battery', 'storage', 'weather', 'screenTime', 'calendar', 'messages'] as const;
type WidgetId = typeof ALL_WIDGET_IDS[number];

const WIDGET_LABELS: Record<WidgetId, string> = {
  battery: 'Battery',
  storage: 'Storage',
  weather: 'Weather',
  screenTime: 'Screen Time',
  calendar: 'Up Next',
  messages: 'Messages',
};

const DEFAULT_CONFIG: WidgetConfig = {
  visible: [...ALL_WIDGET_IDS],
  order: [...ALL_WIDGET_IDS],
};

interface WidgetConfig {
  visible: string[];
  order: string[];
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
// AsyncStorage config helpers
// ---------------------------------------------------------------------------

async function loadWidgetConfig(): Promise<WidgetConfig> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<WidgetConfig>;
    const visible = Array.isArray(parsed.visible) ? parsed.visible : DEFAULT_CONFIG.visible;
    const order = Array.isArray(parsed.order) ? parsed.order : DEFAULT_CONFIG.order;
    // Ensure any newly added widget IDs are included in order/visible for forward-compat
    const missingFromOrder = ALL_WIDGET_IDS.filter((id) => !order.includes(id));
    return {
      visible,
      order: [...order, ...missingFromOrder],
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function saveWidgetConfig(config: WidgetConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Widget base card
// ---------------------------------------------------------------------------

interface WidgetCardProps {
  children: React.ReactNode;
  style?: object;
  onPress?: () => void;
  editMode?: boolean;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}

function WidgetCard({
  children,
  style,
  onPress,
  editMode,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: WidgetCardProps) {
  const inner = (
    <>
      <BlurView intensity={55} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
      <View style={styles.widgetContent}>{children}</View>
      {editMode && (
        <View style={styles.editOverlay}>
          {/* Remove button top-left */}
          <TouchableOpacity style={styles.removeBtn} onPress={onRemove} hitSlop={8}>
            <Ionicons name="remove-circle" size={26} color="#FF453A" />
          </TouchableOpacity>
          {/* Up/Down reorder buttons top-right */}
          <View style={styles.reorderBtns}>
            <TouchableOpacity
              style={[styles.reorderBtn, isFirst && styles.reorderBtnDisabled]}
              onPress={isFirst ? undefined : onMoveUp}
              hitSlop={6}
            >
              <Ionicons name="chevron-up" size={18} color={isFirst ? 'rgba(255,255,255,0.2)' : '#ffffff'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.reorderBtn, isLast && styles.reorderBtnDisabled]}
              onPress={isLast ? undefined : onMoveDown}
              hitSlop={6}
            >
              <Ionicons name="chevron-down" size={18} color={isLast ? 'rgba(255,255,255,0.2)' : '#ffffff'} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );

  if (!editMode && onPress) {
    return (
      <Pressable
        style={[styles.widgetCard, style]}
        onPress={onPress}
        android_ripple={{ color: 'rgba(255,255,255,0.1)', borderless: false }}
      >
        {inner}
      </Pressable>
    );
  }
  return (
    <View style={[styles.widgetCard, editMode && styles.widgetCardEdit, style]}>
      {inner}
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

interface EditableWidgetProps {
  editMode: boolean;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

function BatteryWidget({
  level,
  isCharging,
  onPress,
  editMode,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: { level: number; isCharging: boolean; onPress?: () => void } & EditableWidgetProps) {
  const pct = Math.round(level * 100);
  const color = pct > 20 ? '#30D158' : '#FF453A';
  const iconName: keyof typeof Ionicons.glyphMap = isCharging
    ? 'battery-charging'
    : pct > 50
    ? 'battery-full'
    : pct > 20
    ? 'battery-half'
    : 'battery-dead';

  return (
    <WidgetCard
      onPress={onPress}
      editMode={editMode}
      onRemove={onRemove}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      isFirst={isFirst}
      isLast={isLast}
    >
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
  freeGB,
  usedPercentage,
  onPress,
  editMode,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  usedGB: string;
  totalGB: string;
  freeGB: string;
  usedPercentage: number;
  onPress?: () => void;
} & EditableWidgetProps) {
  const pct = usedPercentage / 100;
  const color = pct > 0.85 ? '#FF453A' : pct > 0.65 ? '#FF9F0A' : '#0A84FF';
  const hasData = parseFloat(totalGB) > 0;

  return (
    <WidgetCard
      onPress={onPress}
      editMode={editMode}
      onRemove={onRemove}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      isFirst={isFirst}
      isLast={isLast}
    >
      <View style={styles.widgetRow}>
        <Ionicons name="server-outline" size={22} color={color} />
        <Text style={styles.widgetTitle}>Storage</Text>
      </View>
      {hasData ? (
        <>
          <View style={styles.storageRow}>
            <Text style={styles.widgetBigNumber}>{usedGB} GB</Text>
            <Text style={styles.widgetSubtext}> / {totalGB} GB total</Text>
          </View>
          <ProgressBar value={pct} color={color} />
          <Text style={styles.widgetSubtext}>{freeGB} GB free · {Math.round(usedPercentage)}% used</Text>
        </>
      ) : (
        <Text style={styles.widgetSubtext}>Storage data unavailable</Text>
      )}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Weather Widget (live data from wttr.in)
// ---------------------------------------------------------------------------

function WeatherWidget({
  temp,
  condition,
  icon,
  city,
  editMode,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  temp: number;
  condition: string;
  icon: string;
  city: string;
} & EditableWidgetProps) {
  const hasLocation = city.trim().length > 0;
  const iconName = hasLocation
    ? (`${icon}-outline` as keyof typeof Ionicons.glyphMap)
    : ('location-outline' as keyof typeof Ionicons.glyphMap);

  return (
    <WidgetCard
      editMode={editMode}
      onRemove={onRemove}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      isFirst={isFirst}
      isLast={isLast}
    >
      <View style={styles.widgetRow}>
        <Ionicons name={iconName} size={22} color="#FFD60A" />
        <Text style={styles.widgetTitle}>Weather</Text>
        {hasLocation ? (
          <Text style={[styles.widgetTitle, { marginLeft: 'auto' as any, textTransform: 'none' }]}>{city}</Text>
        ) : null}
      </View>
      {hasLocation ? (
        <View style={styles.weatherRow}>
          <Text style={styles.weatherTemp}>{temp}°C</Text>
          <Text style={styles.weatherDesc}>{condition || '—'}</Text>
        </View>
      ) : (
        <View style={styles.upNextBody}>
          <Text style={styles.widgetSubtext}>Enable Location for weather</Text>
          <Text style={[styles.widgetSubtext, { fontSize: 11, marginTop: 2 }]}>
            Settings → Privacy → Location Services
          </Text>
        </View>
      )}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Screen Time Widget (Android — data unavailable without native module)
// ---------------------------------------------------------------------------

function ScreenTimeWidget({
  editMode,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: EditableWidgetProps) {
  return (
    <WidgetCard
      editMode={editMode}
      onRemove={onRemove}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      isFirst={isFirst}
      isLast={isLast}
    >
      <View style={styles.widgetRow}>
        <Ionicons name="time-outline" size={22} color="#BF5AF2" />
        <Text style={styles.widgetTitle}>Screen Time</Text>
      </View>
      <Text style={[styles.widgetSubtext, { color: 'rgba(255,255,255,0.6)', fontSize: 14 }]}>
        Usage data unavailable
      </Text>
      <Text style={styles.widgetSubtext}>
        Check Android Digital Wellbeing for screen time stats
      </Text>
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

function UpNextWidget({
  events,
  editMode,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: { events: CalendarEventItem[] } & EditableWidgetProps) {
  return (
    <WidgetCard
      editMode={editMode}
      onRemove={onRemove}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      isFirst={isFirst}
      isLast={isLast}
    >
      <View style={styles.widgetRow}>
        <Ionicons name="calendar-outline" size={22} color="#FF9F0A" />
        <Text style={styles.widgetTitle}>Up Next</Text>
      </View>
      {events.length === 0 ? (
        <View style={styles.upNextBody}>
          <Ionicons name="calendar" size={36} color="rgba(255,255,255,0.2)" />
          <Text style={styles.upNextText}>No upcoming events</Text>
        </View>
      ) : (
        events.map((ev) => (
          <View key={ev.id} style={styles.eventRow}>
            <View style={styles.eventDot} />
            <View style={styles.eventMeta}>
              <Text style={styles.eventTitle} numberOfLines={1}>{ev.title}</Text>
              <Text style={styles.eventTime}>{formatEventTime(ev.start, ev.allDay)}{ev.location ? `  ·  ${ev.location}` : ''}</Text>
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

function MessagesWidget({
  unreadCount,
  onPress,
  editMode,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: { unreadCount: number; onPress?: () => void } & EditableWidgetProps) {
  return (
    <WidgetCard
      onPress={onPress}
      editMode={editMode}
      onRemove={onRemove}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      isFirst={isFirst}
      isLast={isLast}
    >
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
// Add Widget card (shown in edit mode at bottom)
// ---------------------------------------------------------------------------

function AddWidgetCard({ id, onAdd }: { id: WidgetId; onAdd: (id: WidgetId) => void }) {
  return (
    <TouchableOpacity
      style={styles.addWidgetRow}
      onPress={() => onAdd(id)}
      activeOpacity={0.7}
    >
      <Ionicons name="add-circle" size={26} color="#30D158" />
      <Text style={styles.addWidgetLabel}>{WIDGET_LABELS[id]}</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export function TodayViewScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const device = useDevice();
  const nav = useNavigation<any>();

  const today = useMemo(() => formatDate(new Date()), []);

  const unreadCount = useMemo(
    () => device.messages.filter((m) => !m.isRead && m.type === 1).length,
    [device.messages],
  );

  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Load widget config from AsyncStorage
  useEffect(() => {
    loadWidgetConfig().then((c) => {
      setConfig(c);
      setConfigLoaded(true);
    });
  }, []);

  // Persist config changes
  useEffect(() => {
    if (configLoaded) {
      saveWidgetConfig(config);
    }
  }, [config, configLoaded]);

  // Load calendar events
  useEffect(() => {
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

  // Ordered + visible widget IDs
  const visibleWidgets = useMemo(
    () => config.order.filter((id) => config.visible.includes(id)) as WidgetId[],
    [config],
  );

  const hiddenWidgets = useMemo(
    () => ALL_WIDGET_IDS.filter((id) => !config.visible.includes(id)),
    [config],
  );

  const removeWidget = useCallback((id: string) => {
    setConfig((prev) => ({
      ...prev,
      visible: prev.visible.filter((v) => v !== id),
    }));
  }, []);

  const addWidget = useCallback((id: WidgetId) => {
    setConfig((prev) => ({
      ...prev,
      visible: [...prev.visible, id],
      // Ensure it's in order list too (it should already be, but guard)
      order: prev.order.includes(id) ? prev.order : [...prev.order, id],
    }));
  }, []);

  const moveWidget = useCallback((id: string, direction: 'up' | 'down') => {
    setConfig((prev) => {
      const orderedVisible = prev.order.filter((o) => prev.visible.includes(o));
      const idx = orderedVisible.indexOf(id);
      if (idx === -1) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= orderedVisible.length) return prev;
      const newOrderedVisible = [...orderedVisible];
      [newOrderedVisible[idx], newOrderedVisible[newIdx]] = [newOrderedVisible[newIdx], newOrderedVisible[idx]];
      // Rebuild full order: keep hidden widgets in their relative positions at the end
      const hiddenInOrder = prev.order.filter((o) => !prev.visible.includes(o));
      return {
        ...prev,
        order: [...newOrderedVisible, ...hiddenInOrder],
      };
    });
  }, []);

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

  const renderWidget = (id: WidgetId, index: number) => {
    const isFirst = index === 0;
    const isLast = index === visibleWidgets.length - 1;
    const editProps: EditableWidgetProps = {
      editMode,
      onRemove: () => removeWidget(id),
      onMoveUp: () => moveWidget(id, 'up'),
      onMoveDown: () => moveWidget(id, 'down'),
      isFirst,
      isLast,
    };

    switch (id) {
      case 'battery':
        return (
          <BatteryWidget
            key={id}
            level={device.battery.level}
            isCharging={device.battery.isCharging}
            onPress={() => nav.navigate('Battery')}
            {...editProps}
          />
        );
      case 'storage':
        return (
          <StorageWidget
            key={id}
            usedGB={device.storage.usedGB}
            totalGB={device.storage.totalGB}
            freeGB={device.storage.freeGB}
            usedPercentage={device.storage.usedPercentage}
            onPress={() => nav.navigate('Storage')}
            {...editProps}
          />
        );
      case 'weather':
        return (
          <WeatherWidget
            key={id}
            temp={device.weather.temp}
            condition={device.weather.condition}
            icon={device.weather.icon}
            city={device.weather.city}
            {...editProps}
          />
        );
      case 'screenTime':
        return (
          <ScreenTimeWidget
            key={id}
            {...editProps}
          />
        );
      case 'calendar':
        return (
          <UpNextWidget
            key={id}
            events={calendarEvents}
            {...editProps}
          />
        );
      case 'messages':
        return (
          <MessagesWidget
            key={id}
            unreadCount={unreadCount}
            onPress={() => nav.navigate('Messages')}
            {...editProps}
          />
        );
      default:
        return null;
    }
  };

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
            {/* Date header + Edit button */}
            <View style={styles.headerRow}>
              <Text style={styles.dateText}>{today}</Text>
              <TouchableOpacity
                style={[styles.editBtn, editMode && styles.editBtnActive]}
                onPress={() => setEditMode((v) => !v)}
                hitSlop={8}
              >
                <Text style={[styles.editBtnText, editMode && styles.editBtnTextActive]}>
                  {editMode ? 'Done' : 'Edit'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Widgets */}
            {visibleWidgets.map((id, index) => renderWidget(id, index))}

            {/* Add Widget section (edit mode only) */}
            {editMode && hiddenWidgets.length > 0 && (
              <View style={styles.addWidgetSection}>
                <BlurView intensity={55} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
                <View style={styles.addWidgetContent}>
                  <Text style={styles.addWidgetHeader}>Add Widget</Text>
                  {hiddenWidgets.map((id) => (
                    <AddWidgetCard key={id} id={id} onAdd={addWidget} />
                  ))}
                </View>
              </View>
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

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  dateText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  editBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  editBtnActive: {
    backgroundColor: 'rgba(10,132,255,0.25)',
  },
  editBtnText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontWeight: '500',
  },
  editBtnTextActive: {
    color: '#0A84FF',
  },

  // Widget card
  widgetCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: 'rgba(30,30,35,0.6)',
  },
  widgetCardEdit: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  widgetContent: {
    padding: 16,
  },

  // Edit overlay (remove + reorder buttons)
  editOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  removeBtn: {
    zIndex: 10,
  },
  reorderBtns: {
    flexDirection: 'row',
    gap: 4,
  },
  reorderBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.05)',
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

  // Add Widget section
  addWidgetSection: {
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 14,
    backgroundColor: 'rgba(30,30,35,0.6)',
  },
  addWidgetContent: {
    padding: 16,
  },
  addWidgetHeader: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  addWidgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  addWidgetLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '400',
  },
});
