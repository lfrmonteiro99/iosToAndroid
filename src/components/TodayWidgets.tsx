import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WidgetCard } from './WidgetCard';
import { useDevice } from '../store/DeviceStore';
import { useTheme } from '../theme/ThemeContext';
import type { AppNavigationProp } from '../navigation/types';

// ---------------------------------------------------------------------------
// Widget configuration types & storage
//
// Shared between TodayViewScreen (the full Today View sheet, with the Edit
// Widgets panel) and LauncherHomeScreen (the iOS-style widget area on the
// first home page) so both surfaces render the exact same widget instances
// from the exact same enabled/order config — never two independent copies
// that could drift (#654).
// ---------------------------------------------------------------------------

export type WidgetType = 'battery' | 'storage' | 'weather' | 'upNext' | 'messages' | 'screenTime';

export const ALL_WIDGET_TYPES: WidgetType[] = ['battery', 'storage', 'weather', 'upNext', 'messages', 'screenTime'];
export const DEFAULT_ENABLED: WidgetType[] = ['battery', 'weather', 'storage', 'upNext', 'messages'];
export const WIDGET_CONFIG_KEY = '@iostoandroid/widget_config';

export const WIDGET_LABELS: Record<WidgetType, string> = {
  battery: 'Battery',
  storage: 'Storage',
  weather: 'Weather',
  upNext: 'Up Next',
  messages: 'Messages',
  screenTime: 'Screen Time',
};

export const WIDGET_ICONS: Record<WidgetType, keyof typeof Ionicons.glyphMap> = {
  battery: 'battery-full',
  storage: 'server-outline',
  weather: 'partly-sunny-outline',
  upNext: 'calendar-outline',
  messages: 'chatbubble-ellipses-outline',
  screenTime: 'hourglass-outline',
};

export async function loadWidgetConfig(): Promise<WidgetType[]> {
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

export async function saveWidgetConfig(config: WidgetType[]): Promise<void> {
  await AsyncStorage.setItem(WIDGET_CONFIG_KEY, JSON.stringify(config));
}

export function useWidgetConfig() {
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
// Progress bar (minimal, no external dep)
// ---------------------------------------------------------------------------

function ProgressBar({ value, color }: { value: number; color?: string }) {
  const { theme } = useTheme();
  const barColor = color ?? theme.colors.accent;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.round(value * 100)}%` as `${number}%`, backgroundColor: barColor }]} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Battery Widget
// ---------------------------------------------------------------------------

export function BatteryWidget({ level, isCharging, onPress }: { level: number; isCharging: boolean; onPress?: () => void }) {
  const { textScale } = useTheme();
  const pct = Math.round(level * 100);
  const color = pct > 20 ? '#30D158' : '#FF453A';
  const iconName: keyof typeof Ionicons.glyphMap = isCharging ? 'battery-charging' : (pct > 50 ? 'battery-full' : pct > 20 ? 'battery-half' : 'battery-dead');

  return (
    <WidgetCard testID="widget-card-battery" onPress={onPress} accessibilityLabel={`Battery ${pct}%${isCharging ? ', charging' : ''}`}>
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

export function StorageWidget({
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
    <WidgetCard testID="widget-card-storage" onPress={onPress} accessibilityLabel={`Storage: ${usedGB} GB of ${totalGB} GB used`}>
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

export function WeatherWidget({ temp, condition, icon, city }: { temp: number; condition: string; icon: string; city: string }) {
  const { textScale } = useTheme();
  const iconName = `${icon}-outline` as keyof typeof Ionicons.glyphMap;
  const isUnavailable = !condition;

  if (isUnavailable) {
    return (
      <WidgetCard testID="widget-card-weather">
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
    <WidgetCard testID="widget-card-weather">
      <View style={styles.widgetRow}>
        <Ionicons name={iconName} size={22} color="#FFD60A" />
        <Text style={[styles.widgetTitle, { fontSize: 14 * textScale }]}>Weather</Text>
        {city ? <Text style={[styles.widgetTitle, { marginLeft: 'auto' as const, textTransform: 'none', fontSize: 14 * textScale }]}>{city}</Text> : null}
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

export interface CalendarEventItem {
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

export function UpNextWidget({ events }: { events: CalendarEventItem[] }) {
  const { textScale } = useTheme();
  return (
    <WidgetCard testID="widget-card-upNext">
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

export function MessagesWidget({ unreadCount, onPress }: { unreadCount: number; onPress?: () => void }) {
  const { textScale } = useTheme();
  return (
    <WidgetCard testID="widget-card-messages" onPress={onPress} accessibilityLabel={`Messages: ${unreadCount > 0 ? `${unreadCount} unread` : 'No unread messages'}`}>
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

function formatScreenTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function ScreenTimeWidget({ onPress }: { onPress?: () => void }) {
  const { textScale } = useTheme();
  const [totalMinutes, setTotalMinutes] = React.useState<number | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const mod = (await import('../../modules/launcher-module/src')).default;
        const data = await mod.getTodayScreenTime();
        setTotalMinutes(data.totalMinutes);
      } catch {
        // Usage Access permission not granted or module unavailable — leave null
      }
    })();
  }, []);

  return (
    <WidgetCard testID="widget-card-screenTime" onPress={onPress} accessibilityLabel={totalMinutes !== null ? `Screen Time: ${formatScreenTime(totalMinutes)} today` : 'Screen Time'}>
      <View style={styles.widgetRow}>
        <Ionicons name="hourglass-outline" size={22} color="#BF5AF2" />
        <Text style={[styles.widgetTitle, { fontSize: 14 * textScale }]}>Screen Time</Text>
      </View>
      {totalMinutes !== null ? (
        <>
          <Text style={[styles.widgetBigNumber, { color: '#BF5AF2', fontSize: 36 * textScale }]}>
            {formatScreenTime(totalMinutes)}
          </Text>
          <Text style={[styles.widgetSubtext, { fontSize: 13 * textScale }]}>today</Text>
        </>
      ) : (
        <Text style={[styles.widgetSubtext, { fontSize: 13 * textScale }]}>Tap to view screen time details</Text>
      )}
    </WidgetCard>
  );
}

// ---------------------------------------------------------------------------
// Widget map — one rendered instance per WidgetType, backed by live device
// state. Both TodayViewScreen and LauncherHomeScreen call this so a widget
// looks and behaves identically regardless of which surface hosts it.
// ---------------------------------------------------------------------------

export function useWidgetMap(): Record<WidgetType, React.ReactNode> {
  const device = useDevice();
  const nav = useNavigation<AppNavigationProp>();

  const unreadCount = useMemo(
    () => device.messages.filter((m) => !m.isRead && m.type === 1).length,
    [device.messages],
  );

  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>([]);

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

  return useMemo(
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
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Widget card chrome (radius/padding/glass) lives in the shared
  // components/WidgetCard; these widget styles only cover internals.

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
});
