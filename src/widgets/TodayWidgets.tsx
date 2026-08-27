import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WidgetCard, type WidgetAppearance } from './WidgetCard';
import { ClockWidget } from './ClockWidget';
import { CalendarDateWidget } from './CalendarDateWidget';
import { NowPlayingWidget, type NowPlayingTrack } from './NowPlayingWidget';
import { ActivityWidget } from './ActivityWidget';
import { QuickDialWidget, type QuickDialContact } from './QuickDialWidget';
import { useDevice } from '../store/DeviceStore';
import { useContacts } from '../store/ContactsStore';
import { useHealth, localDateKey } from '../store/HealthStore';
import { logger } from '../utils/logger';
import { useTheme } from '../theme/ThemeContext';
import { SystemColors, WidgetWeatherGradients, WidgetGlassText, type WidgetWeatherCondition } from '../theme/CupertinoTheme';
import type { AppNavigationProp } from '../navigation/types';
import {
  DEFAULT_WIDGET_SIZES,
  WIDGET_INSTANCES_KEY,
  addWidget as addWidgetTo,
  instanceTypes,
  migrateTypesToInstances,
  moveWidget as moveWidgetIn,
  normalizeInstances,
  reconcileWithTypes,
  removeWidget as removeWidgetFrom,
  resizeWidget as resizeWidgetIn,
  type WidgetInstance,
  type WidgetSize,
} from './widgetInstances';

// ---------------------------------------------------------------------------
// Widget configuration types & storage
//
// Shared between TodayViewScreen (the full Today View sheet, with the Edit
// Widgets panel) and LauncherHomeScreen (the iOS-style widget area on the
// first home page) so both surfaces render the exact same widget instances
// from the exact same enabled/order config — never two independent copies
// that could drift (#654).
// ---------------------------------------------------------------------------

/**
 * #963 added five: the set was six cards each showing a glyph, a number and a
 * progress bar, and "more variety" is not six more numbers. These five each
 * show something the others cannot — a face whose hands move, today's date, what
 * is playing, the day's steps, the people you call.
 */
export type WidgetType =
  | 'battery' | 'storage' | 'weather' | 'upNext' | 'messages' | 'screenTime'
  | 'clock' | 'calendar' | 'nowPlaying' | 'activity' | 'quickDial';

export const ALL_WIDGET_TYPES: WidgetType[] = [
  'battery', 'storage', 'weather', 'upNext', 'messages', 'screenTime',
  'clock', 'calendar', 'nowPlaying', 'activity', 'quickDial',
];
export const DEFAULT_ENABLED: WidgetType[] = ['battery', 'weather', 'storage', 'upNext', 'messages'];
export const WIDGET_CONFIG_KEY = '@iostoandroid/widget_config';

/**
 * How often Now Playing re-reads the media session (#963).
 *
 * The bridge exposes a getter, not an event, so this is a poll. Five seconds is
 * slow enough to cost nothing and fast enough that a track change shows up
 * before the user wonders; a control press re-reads immediately regardless.
 */
export const NOW_PLAYING_POLL_MS = 5000;

export const WIDGET_LABELS: Record<WidgetType, string> = {
  battery: 'Battery',
  storage: 'Storage',
  weather: 'Weather',
  upNext: 'Up Next',
  messages: 'Messages',
  screenTime: 'Screen Time',
  clock: 'Clock',
  calendar: 'Calendar',
  nowPlaying: 'Now Playing',
  activity: 'Activity',
  quickDial: 'Favourites',
};

// Filled glyphs, matching the widget bodies below (which already draw `server`,
// `calendar`, `chatbubble-ellipses`, `hourglass`) and the iOS reference, where
// widget glyphs are solid rather than thin line art (#934). The only consumer is
// the "Edit Widgets" panel row (`TodayViewScreen.tsx`).
export const WIDGET_ICONS: Record<WidgetType, keyof typeof Ionicons.glyphMap> = {
  battery: 'battery-full',
  storage: 'server',
  weather: 'partly-sunny',
  upNext: 'calendar',
  messages: 'chatbubble-ellipses',
  screenTime: 'hourglass',
  clock: 'time',
  calendar: 'calendar-number',
  nowPlaying: 'musical-notes',
  activity: 'flame',
  quickDial: 'people-circle',
};

// iOS-style Today View grid: 2 columns. 'small' widgets take one column
// (side-by-side pairs); 'medium'/'large' widgets span both columns, with
// 'large' getting extra vertical room for denser content. Shared between
// TodayViewScreen and the Smart Stack eligibility logic so the stack only
// ever groups widgets that occupy a half-width cell.
// WidgetSize and the per-type table now live in widgetInstances.ts, defined
// once. They used to exist TWICE — `WIDGET_SIZES` here and `DEFAULT_SIZES` in
// widgetGrid.ts — same six entries in two files, free to drift (#933).
export type { WidgetSize, WidgetInstance } from './widgetInstances';
export {
  ALLOWED_WIDGET_SIZES,
  DEFAULT_WIDGET_SIZES,
  WIDGET_INSTANCES_KEY,
  migrateTypesToInstances,
  normalizeInstances,
} from './widgetInstances';

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

/**
 * Read the placed widgets, migrating the old type list on first run.
 *
 * The migration writes to a NEW key and leaves `@iostoandroid/widget_config`
 * untouched. Someone who installs this version and then rolls back still has
 * their widgets — overwriting the old key in place would strand them with an
 * empty home screen and no way to tell why.
 */
export async function loadWidgetInstances(): Promise<WidgetInstance[]> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_INSTANCES_KEY);
    if (raw != null) {
      return normalizeInstances(JSON.parse(raw), ALL_WIDGET_TYPES);
    }
  } catch {
    // A corrupt blob falls through to the migration below rather than
    // presenting an empty home screen.
  }

  const legacy = await loadWidgetConfig();
  const migrated = migrateTypesToInstances(legacy);
  try {
    await AsyncStorage.setItem(WIDGET_INSTANCES_KEY, JSON.stringify(migrated));
  } catch {
    // Persisting the migration is best-effort; it re-runs next launch.
  }
  return migrated;
}

export async function saveWidgetInstances(instances: WidgetInstance[]): Promise<void> {
  await AsyncStorage.setItem(WIDGET_INSTANCES_KEY, JSON.stringify(instances));
}

// ---------------------------------------------------------------------------
// Smart Stack configuration (#810) — which widgets are grouped into the single
// auto-rotating cell above the 2-column grid.
//
// The stack reuses the SAME grid defaults (small = one column). Only the
// small-sized widgets are eligible to be stacked: a medium/large card spans
// both columns and is conceptually one full-width item, so stacking it with
// others would collide with the shared sizing. Stacking 2..4 small widgets
// into one half-width cell is exactly the iOS behaviour the issue asks for.
// ---------------------------------------------------------------------------

export const SMART_STACK_KEY = '@iostoandroid/smart_stack';
export const SMART_STACK_MIN = 2;
export const SMART_STACK_MAX = 4;

/** Small widgets that may be grouped into the stack (half-width cells). */
export const SMART_STACK_ELIGIBLE: WidgetType[] = (['battery', 'storage', 'messages', 'screenTime'] as WidgetType[]).filter(
  (t) => DEFAULT_WIDGET_SIZES[t] === 'small',
);

export async function loadSmartStackConfig(): Promise<WidgetType[]> {
  try {
    const raw = await AsyncStorage.getItem(SMART_STACK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WidgetType[];
      // Keep only known, eligible (small) widget types, in a valid count.
      const valid = (parsed.filter((t) => SMART_STACK_ELIGIBLE.includes(t)) as WidgetType[]);
      return valid;
    }
  } catch {
    // fall through
  }
  return [];
}

export async function saveSmartStackConfig(config: WidgetType[]): Promise<void> {
  const clamped = config.filter((t) => SMART_STACK_ELIGIBLE.includes(t));
  await AsyncStorage.setItem(SMART_STACK_KEY, JSON.stringify(clamped));
}

export function useSmartStackConfig() {
  const [stack, setStackState] = useState<WidgetType[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadSmartStackConfig().then((cfg) => {
      setStackState(cfg);
      setLoaded(true);
    });
  }, []);

  const setStack = useCallback((next: WidgetType[]) => {
    setStackState(next);
    saveSmartStackConfig(next);
  }, []);

  return { stack, setStack, loaded };
}

/**
 * The placed widgets, plus the CRUD the rest of the epic needs.
 *
 * `enabled` / `setEnabled` are kept, derived from the instances, because the
 * Today View's Edit Widgets panel and the gallery still speak in types and
 * rewriting them is not this issue (#933 is the model; #935-#938 are the
 * surfaces). Reading `enabled` gives the types in order; writing it reconciles
 * — a type that appears gains an instance, one that disappears loses its, and
 * everything else keeps its id, size and position.
 */
export function useWidgetConfig() {
  const [instances, setInstances] = useState<WidgetInstance[]>(() =>
    migrateTypesToInstances(DEFAULT_ENABLED),
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    loadWidgetInstances().then((list) => {
      if (!alive) return;
      setInstances(list);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  const persist = useCallback((next: WidgetInstance[]) => {
    setInstances(next);
    saveWidgetInstances(next);
  }, []);

  const enabled = useMemo(() => instanceTypes(instances), [instances]);

  const setEnabled = useCallback(
    (next: WidgetType[]) => {
      setInstances((prev) => {
        const reconciled = reconcileWithTypes(prev, next);
        saveWidgetInstances(reconciled);
        return reconciled;
      });
    },
    [],
  );

  const addWidget = useCallback(
    (type: WidgetType, opts?: { size?: WidgetSize; page?: number; col?: number; row?: number }) => {
      setInstances((prev) => {
        const next = addWidgetTo(prev, type, opts ?? {});
        saveWidgetInstances(next);
        return next;
      });
    },
    [],
  );

  const removeWidget = useCallback((id: string) => {
    setInstances((prev) => {
      const next = removeWidgetFrom(prev, id);
      saveWidgetInstances(next);
      return next;
    });
  }, []);

  const moveWidget = useCallback((id: string, page: number, col: number, row: number) => {
    setInstances((prev) => {
      const next = moveWidgetIn(prev, id, page, col, row);
      saveWidgetInstances(next);
      return next;
    });
  }, []);

  const resizeWidget = useCallback((id: string, size: WidgetSize) => {
    setInstances((prev) => {
      const next = resizeWidgetIn(prev, id, size);
      saveWidgetInstances(next);
      return next;
    });
  }, []);

  return {
    instances,
    setInstances: persist,
    addWidget,
    removeWidget,
    moveWidget,
    resizeWidget,
    enabled,
    setEnabled,
    loaded,
  };
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
  const color = pct > 20 ? SystemColors.dark.systemGreen : SystemColors.dark.systemRed;
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
  const color = pct > 0.85 ? SystemColors.dark.systemRed : pct > 0.65 ? SystemColors.dark.systemOrange : theme.colors.accent;

  return (
    <WidgetCard testID="widget-card-storage" onPress={onPress} accessibilityLabel={`Storage: ${usedGB} GB of ${totalGB} GB used`}>
      <View style={styles.widgetRow}>
        <Ionicons name="server" size={22} color={color} />
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

/** Groups the raw wttr.in condition icon into one of the four gradient moods. */
function weatherGradientCondition(icon: string): WidgetWeatherCondition {
  if (icon === 'sunny') return 'clear';
  if (icon === 'snow') return 'snow';
  if (icon === 'rainy' || icon === 'thunderstorm') return 'rain';
  return 'cloudy'; // partly-sunny, cloud, and any unrecognised icon
}

export function WeatherWidget({
  temp,
  condition,
  icon,
  city,
  maxTemp,
  minTemp,
  size,
}: {
  temp: number;
  condition: string;
  icon: string;
  city: string;
  maxTemp?: number;
  minTemp?: number;
  /**
   * Placement size (#937). Omitted = today's full content, so every existing
   * caller (Today View grid, the widget gallery preview) is unaffected — only
   * a caller that knows about per-instance sizing opts in. 'small' is the only
   * size that trims anything: the city label and the H/L range are what the
   * reference shows growing in as the card gets taller, so 'small' is where
   * they come out rather than the small card just being a smaller rectangle of
   * the same content.
   */
  size?: WidgetSize;
}) {
  const { textScale } = useTheme();
  const isUnavailable = !condition;
  const isCompact = size === 'small';
  const gradientColors = WidgetWeatherGradients[weatherGradientCondition(icon)];
  // Own colored surface regardless of app theme (like the reference widget); the
  // Reduce Transparency fallback uses the gradient's darker stop as a flat fill.
  const appearance: WidgetAppearance = {
    surface: 'gradient',
    gradientColors,
    solidColor: { light: gradientColors[1], dark: gradientColors[1] },
  };

  // Every Text in this widget sits on a colored gradient stop, not the
  // near-black glass frame WidgetGlassText.title/.secondary were tuned for
  // (rgba(...,0.75) / rgba(...,0.55) blended over a lighter stop drops well
  // below WCAG AA — see the token comment on WidgetWeatherGradients). Opaque
  // primary is the only tone in that set that clears 4.5:1 on every stop.
  if (isUnavailable) {
    return (
      <WidgetCard testID="widget-card-weather" appearance={appearance}>
        <View style={styles.widgetRow}>
          <Ionicons name="cloud-offline" size={22} color={WidgetGlassText.primary} />
          <Text style={[styles.widgetTitle, { fontSize: 14 * textScale, color: WidgetGlassText.primary }]}>Weather</Text>
        </View>
        <Text style={[styles.widgetSubtext, { fontSize: 15 * textScale, marginTop: 8, color: WidgetGlassText.primary }]}>
          Unable to load weather
        </Text>
      </WidgetCard>
    );
  }

  const iconName = icon as keyof typeof Ionicons.glyphMap;
  const hasRange = !isCompact && maxTemp !== undefined && minTemp !== undefined;
  const showCity = !isCompact && !!city;

  return (
    <WidgetCard testID="widget-card-weather" appearance={appearance}>
      <View style={styles.widgetRow}>
        <Ionicons name={iconName} size={22} color={WidgetGlassText.primary} />
        <Text style={[styles.widgetTitle, { fontSize: 14 * textScale, color: WidgetGlassText.primary }]}>Weather</Text>
        {showCity ? <Text style={[styles.widgetTitle, { marginLeft: 'auto' as const, textTransform: 'none', fontSize: 14 * textScale, color: WidgetGlassText.primary }]}>{city}</Text> : null}
      </View>
      <View style={styles.weatherRow}>
        <Text style={[styles.weatherTemp, { fontSize: 40 * textScale }]}>{temp}°</Text>
        <Text style={[styles.weatherDesc, { fontSize: 16 * textScale, color: WidgetGlassText.primary }]}>{condition}</Text>
      </View>
      {hasRange ? (
        <Text style={[styles.widgetSubtext, { fontSize: 13 * textScale, color: WidgetGlassText.primary }]}>
          {`H:${maxTemp}°  L:${minTemp}°`}
        </Text>
      ) : null}
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

/** Start–end range for a timed event, or the single "All day" label. */
function formatEventRange(ev: CalendarEventItem): string {
  if (ev.allDay) return 'All day';
  return `${formatEventTime(ev.start, false)}–${formatEventTime(ev.end, false)}`;
}

const UP_NEXT_BAR_COLORS = [SystemColors.dark.systemOrange, SystemColors.dark.systemBlue, SystemColors.dark.systemGreen];

export function UpNextWidget({
  events,
  now = new Date(),
  size,
}: {
  events: CalendarEventItem[];
  now?: Date;
  /**
   * Placement size (#937). Omitted = today's full content (up to 3 events),
   * for the same reason as WeatherWidget's `size` above. 'medium' is the only
   * size that trims: it shows just the next event, matching the smaller
   * footprint instead of squeezing 3 rows into it.
   */
  size?: WidgetSize;
}) {
  const { theme, textScale } = useTheme();
  const maxEvents = size === 'medium' ? 1 : 3;
  const appearance: WidgetAppearance = {
    surface: 'solid',
    solidColor: {
      light: SystemColors.light.systemBackground,
      dark: SystemColors.dark.secondarySystemBackground,
    },
  };
  const cardTextColor = theme.colors.textPrimary;
  const cardSecondaryColor = theme.colors.textSecondary;
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const dayNumber = now.getDate();

  return (
    <WidgetCard testID="widget-card-upNext" appearance={appearance}>
      <View style={styles.calendarHeader}>
        <Text style={[styles.calendarWeekday, { color: theme.colors.systemRed, fontSize: 13 * textScale }]}>{weekday}</Text>
        <Text style={[styles.calendarDayNumber, { color: cardTextColor, fontSize: 32 * textScale }]}>{dayNumber}</Text>
      </View>
      {events.length === 0 ? (
        <View style={styles.upNextBody}>
          <Ionicons name="calendar" size={36} color={cardSecondaryColor} />
          <Text style={[styles.upNextText, { color: cardSecondaryColor, fontSize: 15 * textScale }]}>No upcoming events</Text>
        </View>
      ) : (
        events.slice(0, maxEvents).map((ev, index) => (
          <View key={ev.id} style={styles.eventRow}>
            <View style={[styles.eventBar, { backgroundColor: UP_NEXT_BAR_COLORS[index % UP_NEXT_BAR_COLORS.length] }]} />
            <View style={styles.eventMeta}>
              <Text style={[styles.eventTitle, { color: cardTextColor, fontSize: 14 * textScale }]} numberOfLines={1}>{ev.title}</Text>
              <Text style={[styles.eventTime, { color: cardSecondaryColor, fontSize: 12 * textScale }]}>{formatEventRange(ev)}{ev.location ? `  ·  ${ev.location}` : ''}</Text>
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
        <Ionicons name="chatbubble-ellipses" size={22} color={SystemColors.dark.systemGreen} />
        <Text style={[styles.widgetTitle, { fontSize: 14 * textScale }]}>Messages</Text>
      </View>
      {unreadCount > 0 ? (
        <>
          <Text style={[styles.widgetBigNumber, { color: SystemColors.dark.systemGreen, fontSize: 36 * textScale }]}>{unreadCount}</Text>
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
        <Ionicons name="hourglass" size={22} color={SystemColors.dark.systemPurple} />
        <Text style={[styles.widgetTitle, { fontSize: 14 * textScale }]}>Screen Time</Text>
      </View>
      {totalMinutes !== null ? (
        <>
          <Text style={[styles.widgetBigNumber, { color: SystemColors.dark.systemPurple, fontSize: 36 * textScale }]}>
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

/**
 * @param sizeFor Per-type size to render content for (#937 AC 8) — omitted
 * types, and every caller that omits the argument entirely, keep the full
 * content this always rendered. Keyed by TYPE rather than instance id because
 * this map is shared by callers (Today View, the widget gallery preview) that
 * have no notion of a placed instance; the home screen (which does) resolves
 * one size per type from whichever of its placed instances the caller picks.
 */
export function useWidgetMap(sizeFor?: Partial<Record<WidgetType, WidgetSize>>): Record<WidgetType, React.ReactNode> {
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

  // ── Now Playing (#963) ───────────────────────────────────────────────────
  // Polled rather than pushed: the bridge exposes a getter, not an event, and
  // the media session changes on a human timescale. The interval is cleared on
  // unmount so a Today View that is closed stops asking.
  const [track, setTrack] = useState<NowPlayingTrack | null>(null);

  useEffect(() => {
    let alive = true;
    const read = async () => {
      try {
        const mod = (await import('../../modules/launcher-module/src')).default;
        const now = await mod.getNowPlaying();
        if (alive) setTrack(now as NowPlayingTrack);
      } catch {
        // No notification-listener access, or no session — leave it empty; the
        // widget renders "Nothing playing" and keeps its controls.
      }
    };
    read();
    const id = setInterval(read, NOW_PLAYING_POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const media = useCallback(async (action: 'prev' | 'playPause' | 'next') => {
    try {
      const mod = (await import('../../modules/launcher-module/src')).default;
      if (action === 'prev') await mod.mediaPrev();
      else if (action === 'next') await mod.mediaNext();
      else await mod.mediaPlayPause();
      // Read straight back: the widget's play/pause glyph is the state, and
      // waiting for the next poll would leave it wrong for up to the interval.
      setTrack((await mod.getNowPlaying()) as NowPlayingTrack);
    } catch (e) {
      logger.warn('TodayWidgets', 'media control failed', e);
    }
  }, []);

  const { favorites } = useContacts();
  const { todaySteps, stepHistory } = useHealth();
  const todayKey = useMemo(() => localDateKey(new Date()), []);
  const quickDialContacts = useMemo<QuickDialContact[]>(
    () => favorites.map((c) => ({
      id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone,
    })),
    [favorites],
  );

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
          maxTemp={device.weather.maxTemp}
          minTemp={device.weather.minTemp}
          size={sizeFor?.weather}
        />
      ),
      upNext: <UpNextWidget key="upNext" events={calendarEvents} size={sizeFor?.upNext} />,
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
      clock: (
        <ClockWidget
          key="clock"
          size={sizeFor?.clock}
          onPress={() => nav.navigate('Clock')}
        />
      ),
      calendar: (
        <CalendarDateWidget
          key="calendar"
          events={calendarEvents}
          size={sizeFor?.calendar}
          onPress={() => nav.navigate('Calendar')}
        />
      ),
      nowPlaying: (
        <NowPlayingWidget
          key="nowPlaying"
          track={track}
          onPrev={() => { void media('prev'); }}
          onPlayPause={() => { void media('playPause'); }}
          onNext={() => { void media('next'); }}
        />
      ),
      activity: (
        <ActivityWidget
          key="activity"
          steps={todaySteps}
          history={stepHistory}
          today={todayKey}
          size={sizeFor?.activity}
          onPress={() => nav.navigate('Health')}
        />
      ),
      quickDial: (
        <QuickDialWidget
          key="quickDial"
          contacts={quickDialContacts}
          onCall={(contact) => nav.navigate('CallScreen', {
            name: `${contact.firstName} ${contact.lastName}`.trim(),
            number: contact.phone,
          })}
          onPress={() => nav.navigate('Contacts')}
        />
      ),
    }),
    [
      device, calendarEvents, unreadCount, nav, sizeFor?.weather, sizeFor?.upNext,
      sizeFor?.clock, sizeFor?.calendar, sizeFor?.activity,
      track, media, todaySteps, stepHistory, todayKey, quickDialContacts,
    ],
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
    color: WidgetGlassText.title,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.2,
    textTransform: 'uppercase',
  },
  widgetBigNumber: {
    color: WidgetGlassText.primary,
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 6,
  },
  widgetSubtext: {
    color: WidgetGlassText.secondary,
    fontSize: 13,
    fontWeight: '400',
    marginTop: 6,
  },

  // Progress bar
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: WidgetGlassText.progressTrack,
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

  // Weather — gradient surface, so the white glass text tones read on every
  // condition mood (all four are mid/dark saturation, see WidgetWeatherGradients).
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    marginBottom: 4,
  },
  weatherTemp: {
    color: WidgetGlassText.primary,
    fontWeight: '200',
    letterSpacing: -1,
  },
  weatherDesc: {
    color: WidgetGlassText.title,
    fontWeight: '400',
  },

  // Up Next — solid surface that follows the theme, so its text comes from
  // theme.colors (passed inline per row) rather than a fixed tone here.
  calendarHeader: {
    marginBottom: 10,
  },
  calendarWeekday: {
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  calendarDayNumber: {
    fontWeight: '700',
    letterSpacing: -1,
  },
  upNextBody: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  upNextText: {
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
  eventBar: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    minHeight: 28,
  },
  eventMeta: {
    flex: 1,
  },
  eventTitle: {
    fontWeight: '500',
  },
  eventTime: {
    fontWeight: '400',
    marginTop: 2,
  },
});
