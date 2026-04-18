import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoSegmentedControl,
  CupertinoSwitch,
  CupertinoSearchBar,
  CupertinoTextField,
  CupertinoSwipeableRow,
  CupertinoPicker,
} from '../components';
import type { AppNavigationProp } from '../navigation/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TABS = ['World Clock', 'Alarm', 'Stopwatch', 'Timer'];

const ALARMS_STORAGE_KEY = '@iostoandroid/alarms';
const WORLD_CLOCKS_STORAGE_KEY = '@iostoandroid/worldclocks';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Alarm {
  id: string;
  hour: number;
  minute: number;
  label: string;
  days: number[]; // 1=Sunday .. 7=Saturday (Expo weekday format)
  enabled: boolean;
  notificationIds: string[];
}

interface WorldClock {
  city: string;
  timezone: string; // IANA timezone name
}

// ---------------------------------------------------------------------------
// Common IANA timezone list for the "Add City" modal
// ---------------------------------------------------------------------------
const COMMON_CITIES: WorldClock[] = [
  { city: 'New York', timezone: 'America/New_York' },
  { city: 'Los Angeles', timezone: 'America/Los_Angeles' },
  { city: 'Chicago', timezone: 'America/Chicago' },
  { city: 'Denver', timezone: 'America/Denver' },
  { city: 'Anchorage', timezone: 'America/Anchorage' },
  { city: 'Honolulu', timezone: 'Pacific/Honolulu' },
  { city: 'Toronto', timezone: 'America/Toronto' },
  { city: 'Vancouver', timezone: 'America/Vancouver' },
  { city: 'Mexico City', timezone: 'America/Mexico_City' },
  { city: 'Sao Paulo', timezone: 'America/Sao_Paulo' },
  { city: 'Buenos Aires', timezone: 'America/Argentina/Buenos_Aires' },
  { city: 'London', timezone: 'Europe/London' },
  { city: 'Paris', timezone: 'Europe/Paris' },
  { city: 'Berlin', timezone: 'Europe/Berlin' },
  { city: 'Rome', timezone: 'Europe/Rome' },
  { city: 'Madrid', timezone: 'Europe/Madrid' },
  { city: 'Amsterdam', timezone: 'Europe/Amsterdam' },
  { city: 'Moscow', timezone: 'Europe/Moscow' },
  { city: 'Istanbul', timezone: 'Europe/Istanbul' },
  { city: 'Dubai', timezone: 'Asia/Dubai' },
  { city: 'Mumbai', timezone: 'Asia/Kolkata' },
  { city: 'Delhi', timezone: 'Asia/Kolkata' },
  { city: 'Bangkok', timezone: 'Asia/Bangkok' },
  { city: 'Singapore', timezone: 'Asia/Singapore' },
  { city: 'Hong Kong', timezone: 'Asia/Hong_Kong' },
  { city: 'Shanghai', timezone: 'Asia/Shanghai' },
  { city: 'Beijing', timezone: 'Asia/Shanghai' },
  { city: 'Tokyo', timezone: 'Asia/Tokyo' },
  { city: 'Seoul', timezone: 'Asia/Seoul' },
  { city: 'Sydney', timezone: 'Australia/Sydney' },
  { city: 'Melbourne', timezone: 'Australia/Melbourne' },
  { city: 'Auckland', timezone: 'Pacific/Auckland' },
  { city: 'Cairo', timezone: 'Africa/Cairo' },
  { city: 'Johannesburg', timezone: 'Africa/Johannesburg' },
  { city: 'Lagos', timezone: 'Africa/Lagos' },
  { city: 'Nairobi', timezone: 'Africa/Nairobi' },
  { city: 'Riyadh', timezone: 'Asia/Riyadh' },
  { city: 'Taipei', timezone: 'Asia/Taipei' },
  { city: 'Jakarta', timezone: 'Asia/Jakarta' },
  { city: 'Lisbon', timezone: 'Europe/Lisbon' },
];

const DEFAULT_WORLD_CLOCKS: WorldClock[] = [
  { city: 'New York', timezone: 'America/New_York' },
  { city: 'London', timezone: 'Europe/London' },
  { city: 'Tokyo', timezone: 'Asia/Tokyo' },
  { city: 'Sydney', timezone: 'Australia/Sydney' },
  { city: 'Dubai', timezone: 'Asia/Dubai' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const centis = Math.floor((ms % 1000) / 10);
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

function getTimeForTimezone(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date());
  } catch {
    return '--:--';
  }
}

function getHourDiffForTimezone(timezone: string): string {
  try {
    const now = new Date();
    // Get offset in the target timezone
    const targetParts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    }).formatToParts(now);
    const localParts = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'shortOffset',
    }).formatToParts(now);

    const parseOffset = (parts: Intl.DateTimeFormatPart[]): number => {
      const tzPart = parts.find((p) => p.type === 'timeZoneName');
      if (!tzPart) return 0;
      const match = tzPart.value.match(/GMT([+-]?\d+(?::(\d+))?)?/);
      if (!match) return 0;
      if (!match[1]) return 0;
      const hours = parseInt(match[1], 10);
      const minutes = match[2] ? parseInt(match[2], 10) : 0;
      return hours + (hours >= 0 ? minutes / 60 : -minutes / 60);
    };

    const targetOffset = parseOffset(targetParts);
    const localOffset = parseOffset(localParts);
    const diff = targetOffset - localOffset;

    if (diff === 0) return 'Same time';
    const sign = diff > 0 ? '+' : '';
    if (Number.isInteger(diff)) return `${sign}${diff}HRS`;
    return `${sign}${diff.toFixed(1)}HRS`;
  } catch {
    return '';
  }
}

function getDayLabel(timezone: string): string {
  try {
    const now = new Date();
    const localDay = now.getDate();
    const targetDay = parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        day: 'numeric',
      }).format(now),
      10,
    );
    if (targetDay === localDay) return 'Today';
    if (targetDay === localDay + 1 || (localDay > targetDay && targetDay === 1)) return 'Tomorrow';
    if (targetDay === localDay - 1) return 'Yesterday';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    }).format(now);
  } catch {
    return '';
  }
}

function formatAlarmTime(hour: number, minute: number): string {
  const h = hour % 12 || 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h}:${String(minute).padStart(2, '0')} ${ampm}`;
}

function formatDays(days: number[]): string {
  if (days.length === 0) return 'Never';
  if (days.length === 7) return 'Every day';
  const weekdays = [2, 3, 4, 5, 6]; // Mon-Fri in Expo format
  const weekends = [1, 7]; // Sun, Sat in Expo format
  if (weekdays.every((d) => days.includes(d)) && days.length === 5) return 'Weekdays';
  if (weekends.every((d) => days.includes(d)) && days.length === 2) return 'Weekends';
  // Map Expo weekday (1=Sun..7=Sat) to label
  const labelMap: Record<number, string> = {
    1: 'Sun', 2: 'Mon', 3: 'Tue', 4: 'Wed', 5: 'Thu', 6: 'Fri', 7: 'Sat',
  };
  return days
    .sort((a, b) => a - b)
    .map((d) => labelMap[d])
    .join(' ');
}

// ---------------------------------------------------------------------------
// Notification helpers
// ---------------------------------------------------------------------------
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

async function scheduleAlarmNotifications(alarm: Alarm): Promise<string[]> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return [];

  const ids: string[] = [];

  if (alarm.days.length === 0) {
    // One-shot alarm: schedule for next occurrence of this time
    const now = new Date();
    const target = new Date();
    target.setHours(alarm.hour, alarm.minute, 0, 0);
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }
    const seconds = Math.floor((target.getTime() - now.getTime()) / 1000);
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Alarm',
        body: alarm.label || 'Alarm',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(seconds, 1),
        repeats: false,
      },
    });
    ids.push(id);
  } else {
    // Repeating alarm for each selected day
    for (const weekday of alarm.days) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Alarm',
          body: alarm.label || 'Alarm',
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour: alarm.hour,
          minute: alarm.minute,
        },
      });
      ids.push(id);
    }
  }

  return ids;
}

async function cancelAlarmNotifications(notificationIds: string[]): Promise<void> {
  for (const id of notificationIds) {
    await Notifications.cancelScheduledNotificationAsync(id);
  }
}

// ---------------------------------------------------------------------------
// AsyncStorage helpers
// ---------------------------------------------------------------------------
async function loadAlarms(): Promise<Alarm[]> {
  try {
    const raw = await AsyncStorage.getItem(ALARMS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveAlarms(alarms: Alarm[]): Promise<void> {
  await AsyncStorage.setItem(ALARMS_STORAGE_KEY, JSON.stringify(alarms));
}

async function loadWorldClocks(): Promise<WorldClock[]> {
  try {
    const raw = await AsyncStorage.getItem(WORLD_CLOCKS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_WORLD_CLOCKS;
  } catch {
    return DEFAULT_WORLD_CLOCKS;
  }
}

async function saveWorldClocks(clocks: WorldClock[]): Promise<void> {
  await AsyncStorage.setItem(WORLD_CLOCKS_STORAGE_KEY, JSON.stringify(clocks));
}

// ---------------------------------------------------------------------------
// World Clock Tab
// ---------------------------------------------------------------------------
function WorldClockTab() {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const [, setTick] = useState(0);
  const [cities, setCities] = useState<WorldClock[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadWorldClocks().then(setCities);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const persistCities = useCallback((next: WorldClock[]) => {
    setCities(next);
    saveWorldClocks(next);
  }, []);

  const removeCity = useCallback(
    (timezone: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      persistCities(cities.filter((c) => c.timezone !== timezone));
    },
    [cities, persistCities],
  );

  const addCity = useCallback(
    (city: WorldClock) => {
      if (cities.some((c) => c.timezone === city.timezone)) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      persistCities([...cities, city]);
      setShowAddModal(false);
      setSearchQuery('');
    },
    [cities, persistCities],
  );

  const filteredCities = useMemo(() => {
    if (!searchQuery.trim()) return COMMON_CITIES;
    const q = searchQuery.toLowerCase();
    return COMMON_CITIES.filter(
      (c) =>
        c.city.toLowerCase().includes(q) ||
        c.timezone.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  return (
    <View style={styles.tabContent}>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {cities.map((wc) => (
          <CupertinoSwipeableRow
            key={wc.timezone}
            trailingActions={[
              {
                label: 'Delete',
                color: colors.systemRed,
                onPress: () => removeCity(wc.timezone),
              },
            ]}
          >
            <View
              style={[
                styles.worldRow,
                { borderBottomColor: colors.separator, backgroundColor: colors.systemBackground },
              ]}
            >
              <View>
                <Text style={[styles.worldDiff, { color: colors.secondaryLabel }]}>
                  {getDayLabel(wc.timezone)}, {getHourDiffForTimezone(wc.timezone)}
                </Text>
                <Text style={[styles.worldCity, { color: colors.label }]}>{wc.city}</Text>
              </View>
              <Text style={[styles.worldTime, { color: colors.label }]}>
                {getTimeForTimezone(wc.timezone)}
              </Text>
            </View>
          </CupertinoSwipeableRow>
        ))}
      </ScrollView>

      {/* Add City Button */}
      <Pressable
        style={[styles.floatingAddBtn, { backgroundColor: colors.systemOrange }]}
        onPress={() => setShowAddModal(true)}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      {/* Add City Modal */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.systemBackground }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => { setShowAddModal(false); setSearchQuery(''); }}>
              <Text style={[typography.body, { color: colors.systemOrange }]}>Cancel</Text>
            </Pressable>
            <Text style={[typography.headline, { color: colors.label }]}>Choose a City</Text>
            <View style={{ width: 50 }} />
          </View>

          <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <CupertinoSearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search cities"
            />
          </View>

          <ScrollView>
            {filteredCities.map((city) => {
              const alreadyAdded = cities.some((c) => c.timezone === city.timezone);
              return (
                <Pressable
                  key={`${city.city}-${city.timezone}`}
                  style={[styles.cityListRow, { borderBottomColor: colors.separator }]}
                  onPress={() => !alreadyAdded && addCity(city)}
                  disabled={alreadyAdded}
                >
                  <View>
                    <Text style={[typography.body, { color: alreadyAdded ? colors.tertiaryLabel : colors.label }]}>
                      {city.city}
                    </Text>
                    <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>
                      {city.timezone}
                    </Text>
                  </View>
                  {alreadyAdded && (
                    <Ionicons name="checkmark" size={20} color={colors.systemGreen} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Alarm Tab
// ---------------------------------------------------------------------------
function AlarmTab() {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editHour, setEditHour] = useState(7);
  const [editMinute, setEditMinute] = useState(0);
  const [editLabel, setEditLabel] = useState('');
  const [editDays, setEditDays] = useState<number[]>([]);

  // Load alarms from storage on mount
  useEffect(() => {
    loadAlarms().then(setAlarms);
  }, []);

  const persistAlarms = useCallback((next: Alarm[]) => {
    setAlarms(next);
    saveAlarms(next);
  }, []);

  const toggleAlarm = useCallback(
    async (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const alarm = alarms.find((a) => a.id === id);
      if (!alarm) return;

      let updatedAlarms: Alarm[];
      if (alarm.enabled) {
        // Turning off: cancel notifications
        await cancelAlarmNotifications(alarm.notificationIds);
        updatedAlarms = alarms.map((a) =>
          a.id === id ? { ...a, enabled: false, notificationIds: [] } : a,
        );
      } else {
        // Turning on: reschedule notifications
        const notificationIds = await scheduleAlarmNotifications(alarm);
        // Only enable if at least one notification was actually scheduled
        const didSchedule = notificationIds.length > 0;
        updatedAlarms = alarms.map((a) =>
          a.id === id ? { ...a, enabled: didSchedule, notificationIds } : a,
        );
      }
      persistAlarms(updatedAlarms);
    },
    [alarms, persistAlarms],
  );

  const deleteAlarm = useCallback(
    async (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const alarm = alarms.find((a) => a.id === id);
      if (alarm) {
        await cancelAlarmNotifications(alarm.notificationIds);
      }
      persistAlarms(alarms.filter((a) => a.id !== id));
    },
    [alarms, persistAlarms],
  );

  const openAddModal = useCallback(() => {
    setEditHour(7);
    setEditMinute(0);
    setEditLabel('');
    setEditDays([]);
    setShowAddModal(true);
  }, []);

  const handleSaveAlarm = useCallback(async () => {
    const newAlarm: Alarm = {
      id: Date.now().toString(),
      hour: editHour,
      minute: editMinute,
      label: editLabel.trim() || 'Alarm',
      days: editDays,
      enabled: true,
      notificationIds: [],
    };

    const notificationIds = await scheduleAlarmNotifications(newAlarm);
    newAlarm.notificationIds = notificationIds;

    persistAlarms([...alarms, newAlarm]);
    setShowAddModal(false);
  }, [editHour, editMinute, editLabel, editDays, alarms, persistAlarms]);

  const toggleDay = useCallback(
    (day: number) => {
      Haptics.selectionAsync();
      setEditDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
    },
    [],
  );

  const hourItems = useMemo(() => Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')), []);
  const minuteItems = useMemo(() => Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')), []);

  return (
    <View style={styles.tabContent}>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {alarms.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="alarm-outline" size={48} color={colors.tertiaryLabel} />
            <Text style={[typography.body, { color: colors.tertiaryLabel, marginTop: 12 }]}>
              No alarms set
            </Text>
          </View>
        )}
        {alarms.map((alarm) => (
          <CupertinoSwipeableRow
            key={alarm.id}
            trailingActions={[
              {
                label: 'Delete',
                color: colors.systemRed,
                onPress: () => deleteAlarm(alarm.id),
              },
            ]}
          >
            <View
              style={[
                styles.alarmRow,
                { borderBottomColor: colors.separator, backgroundColor: colors.systemBackground },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.alarmTime,
                    { color: alarm.enabled ? colors.label : colors.tertiaryLabel },
                  ]}
                >
                  {formatAlarmTime(alarm.hour, alarm.minute)}
                </Text>
                <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>
                  {alarm.label}, {formatDays(alarm.days)}
                </Text>
              </View>
              <CupertinoSwitch
                value={alarm.enabled}
                onValueChange={() => toggleAlarm(alarm.id)}
              />
            </View>
          </CupertinoSwipeableRow>
        ))}
      </ScrollView>

      {/* Add Alarm Button */}
      <Pressable
        style={[styles.floatingAddBtn, { backgroundColor: colors.systemOrange }]}
        onPress={openAddModal}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      {/* Add Alarm Modal */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.systemBackground }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowAddModal(false)}>
              <Text style={[typography.body, { color: colors.systemOrange }]}>Cancel</Text>
            </Pressable>
            <Text style={[typography.headline, { color: colors.label }]}>Add Alarm</Text>
            <Pressable onPress={handleSaveAlarm}>
              <Text style={[typography.body, { color: colors.systemOrange, fontWeight: '600' }]}>
                Save
              </Text>
            </Pressable>
          </View>

          {/* Time Picker */}
          <View style={styles.pickerContainer}>
            <View style={styles.pickerColumn}>
              <Text style={[typography.caption1, { color: colors.secondaryLabel, textAlign: 'center', marginBottom: 4 }]}>
                Hour
              </Text>
              <CupertinoPicker
                items={hourItems}
                selectedIndex={editHour}
                onIndexChange={setEditHour}
                style={{ width: 100 }}
              />
            </View>
            <Text style={[styles.pickerSeparator, { color: colors.label }]}>:</Text>
            <View style={styles.pickerColumn}>
              <Text style={[typography.caption1, { color: colors.secondaryLabel, textAlign: 'center', marginBottom: 4 }]}>
                Minute
              </Text>
              <CupertinoPicker
                items={minuteItems}
                selectedIndex={editMinute}
                onIndexChange={setEditMinute}
                style={{ width: 100 }}
              />
            </View>
          </View>

          {/* Label */}
          <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
            <Text style={[typography.caption1, { color: colors.secondaryLabel, marginBottom: 6 }]}>
              Label
            </Text>
            <CupertinoTextField
              value={editLabel}
              onChangeText={setEditLabel}
              placeholder="Alarm"
              returnKeyType="done"
            />
          </View>

          {/* Day Selection */}
          <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
            <Text style={[typography.caption1, { color: colors.secondaryLabel, marginBottom: 8 }]}>
              Repeat
            </Text>
            <View style={styles.daysRow}>
              {DAY_LABELS.map((label, index) => {
                // Map index (0=Sun, 1=Mon ... 6=Sat) to Expo weekday (1=Sun ... 7=Sat)
                const expoDay = index + 1;
                const isSelected = editDays.includes(expoDay);
                return (
                  <Pressable
                    key={label}
                    style={[
                      styles.dayChip,
                      {
                        backgroundColor: isSelected ? colors.systemOrange : colors.systemGray5,
                        borderColor: isSelected ? colors.systemOrange : colors.systemGray4,
                      },
                    ]}
                    onPress={() => toggleDay(expoDay)}
                  >
                    <Text
                      style={[
                        styles.dayChipText,
                        { color: isSelected ? '#fff' : colors.label },
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[typography.caption1, { color: colors.tertiaryLabel, marginTop: 6 }]}>
              {editDays.length === 0 ? 'One-time alarm (rings once, tomorrow if time has passed)' : formatDays(editDays)}
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stopwatch Tab (unchanged)
// ---------------------------------------------------------------------------
function StopwatchTab() {
  const { theme } = useTheme();
  const { colors } = theme;
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    if (running) {
      startTimeRef.current = Date.now() - elapsed;
      intervalRef.current = setInterval(() => {
        setElapsed(Date.now() - startTimeRef.current);
      }, 16);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartStop = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRunning((r) => !r);
  };

  const handleLapReset = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (running) {
      setLaps((prev) => [elapsed, ...prev]);
    } else {
      setElapsed(0);
      setLaps([]);
    }
  };

  return (
    <View style={styles.tabContent}>
      <Text style={[styles.stopwatchDisplay, { color: colors.label }]}>{formatTime(elapsed)}</Text>

      <View style={styles.buttonRow}>
        <Pressable style={[styles.roundBtn, { backgroundColor: colors.systemGray5 }]} onPress={handleLapReset}>
          <Text style={[styles.roundBtnText, { color: colors.label }]}>{running ? 'Lap' : 'Reset'}</Text>
        </Pressable>
        <Pressable
          style={[styles.roundBtn, { backgroundColor: running ? 'rgba(255,59,48,0.2)' : 'rgba(52,199,89,0.2)' }]}
          onPress={handleStartStop}
        >
          <Text style={[styles.roundBtnText, { color: running ? colors.systemRed : colors.systemGreen }]}>
            {running ? 'Stop' : 'Start'}
          </Text>
        </Pressable>
      </View>

      <ScrollView style={styles.lapsContainer}>
        {laps.map((lap, i) => (
          <View key={i} style={[styles.lapRow, { borderBottomColor: colors.separator }]}>
            <Text style={{ color: colors.label }}>Lap {laps.length - i}</Text>
            <Text style={{ color: colors.label }}>{formatTime(i === 0 ? elapsed - lap : laps[i - 1] - lap)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Timer Tab (unchanged)
// ---------------------------------------------------------------------------
function TimerTab() {
  const { theme } = useTheme();
  const { colors } = theme;
  const [duration, setDuration] = useState(300); // 5 min default
  const [remaining, setRemaining] = useState(300);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            setRunning(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, remaining]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  const presets = [60, 180, 300, 600, 900, 1800];

  return (
    <View style={styles.tabContent}>
      <Text style={[styles.timerDisplay, { color: colors.label }]}>
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </Text>

      {!running && remaining === duration && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
          {presets.map((p) => (
            <Pressable
              key={p}
              style={[styles.presetBtn, p === duration && { backgroundColor: colors.systemOrange }]}
              onPress={() => { setDuration(p); setRemaining(p); }}
            >
              <Text style={[styles.presetText, { color: p === duration ? '#fff' : colors.systemOrange }]}>
                {p >= 60 ? `${p / 60}m` : `${p}s`}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.roundBtn, { backgroundColor: colors.systemGray5 }]}
          onPress={() => { setRunning(false); setRemaining(duration); }}
        >
          <Text style={[styles.roundBtnText, { color: colors.label }]}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.roundBtn, { backgroundColor: running ? 'rgba(255,59,48,0.2)' : 'rgba(52,199,89,0.2)' }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            if (remaining === 0) { setRemaining(duration); }
            setRunning((r) => !r);
          }}
        >
          <Text style={[styles.roundBtnText, { color: running ? colors.systemRed : colors.systemGreen }]}>
            {running ? 'Pause' : remaining === 0 ? 'Restart' : 'Start'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main ClockScreen
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ClockScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const [tabIndex, setTabIndex] = useState(0);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemBackground, paddingBottom: insets.bottom }]}>
      <CupertinoNavigationBar
        title="Clock"
        leftButton={
          <Text style={[typography.body, { color: colors.systemOrange }]} onPress={() => navigation.goBack()}>
            Done
          </Text>
        }
      />

      <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
        <CupertinoSegmentedControl
          values={TABS}
          selectedIndex={tabIndex}
          onChange={setTabIndex}
        />
      </View>

      {tabIndex === 0 && <WorldClockTab />}
      {tabIndex === 1 && <AlarmTab />}
      {tabIndex === 2 && <StopwatchTab />}
      {tabIndex === 3 && <TimerTab />}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1 },
  tabContent: { flex: 1, paddingHorizontal: 16 },

  // World Clock
  worldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  worldDiff: { fontSize: 13, fontWeight: '400', marginBottom: 2 },
  worldCity: { fontSize: 28, fontWeight: '300' },
  worldTime: { fontSize: 48, fontWeight: '100' },

  // Alarm
  alarmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  alarmTime: { fontSize: 48, fontWeight: '100' },

  // Shared
  floatingAddBtn: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },

  // Modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60,60,67,0.18)',
  },
  cityListRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  // Alarm modal
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
  },
  pickerColumn: {
    alignItems: 'center',
  },
  pickerSeparator: {
    fontSize: 32,
    fontWeight: '300',
    marginHorizontal: 8,
    marginTop: 20,
  },
  daysRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayChip: {
    width: 40,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  dayChipText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Stopwatch
  stopwatchDisplay: {
    fontSize: 72,
    fontWeight: '100',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    marginVertical: 32,
  },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 24 },
  roundBtn: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  roundBtnText: { fontSize: 16, fontWeight: '500' },
  lapsContainer: { flex: 1 },
  lapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  // Timer
  timerDisplay: {
    fontSize: 80,
    fontWeight: '100',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    marginVertical: 32,
  },
  presetRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 24 },
  presetBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.3)',
  },
  presetText: { fontSize: 15, fontWeight: '500' },
});
