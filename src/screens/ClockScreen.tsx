import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { CupertinoNavigationBar, CupertinoSegmentedControl } from '../components';

const TABS = ['World Clock', 'Alarm', 'Stopwatch', 'Timer'];

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const centis = Math.floor((ms % 1000) / 10);
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

const WORLD_CLOCKS = [
  { city: 'New York', offset: -4 },
  { city: 'London', offset: 1 },
  { city: 'Tokyo', offset: 9 },
  { city: 'Sydney', offset: 11 },
  { city: 'Dubai', offset: 4 },
];

function getTimeForOffset(offset: number): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const city = new Date(utc + offset * 3600000);
  return city.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

function getHourDiff(offset: number): string {
  const localOffset = -new Date().getTimezoneOffset() / 60;
  const diff = offset - localOffset;
  if (diff === 0) return 'Same time';
  return diff > 0 ? `+${diff}HRS` : `${diff}HRS`;
}

// ---------------------------------------------------------------------------
// World Clock Tab
// ---------------------------------------------------------------------------
function WorldClockTab() {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {WORLD_CLOCKS.map((wc) => (
        <View key={wc.city} style={[styles.worldRow, { borderBottomColor: colors.separator }]}>
          <View>
            <Text style={[styles.worldDiff, { color: colors.secondaryLabel }]}>{getHourDiff(wc.offset)}</Text>
            <Text style={[styles.worldCity, { color: colors.label }]}>{wc.city}</Text>
          </View>
          <Text style={[styles.worldTime, { color: colors.label }]}>{getTimeForOffset(wc.offset)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Alarm Tab
// ---------------------------------------------------------------------------
function AlarmTab() {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const [alarms, setAlarms] = useState([
    { id: '1', time: '06:30', label: 'Wake Up', enabled: true, days: 'Weekdays' },
    { id: '2', time: '08:00', label: 'Morning', enabled: false, days: 'Weekends' },
  ]);

  const toggleAlarm = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAlarms((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
  };

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {alarms.map((alarm) => (
        <Pressable key={alarm.id} style={[styles.alarmRow, { borderBottomColor: colors.separator }]} onPress={() => toggleAlarm(alarm.id)}>
          <View>
            <Text style={[styles.alarmTime, { color: alarm.enabled ? colors.label : colors.tertiaryLabel }]}>{alarm.time}</Text>
            <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>{alarm.label}, {alarm.days}</Text>
          </View>
          <View style={[styles.alarmToggle, { backgroundColor: alarm.enabled ? colors.systemGreen : colors.systemGray4 }]}>
            <View style={[styles.alarmToggleKnob, { transform: [{ translateX: alarm.enabled ? 20 : 0 }] }]} />
          </View>
        </Pressable>
      ))}
      <Pressable
        style={styles.addBtn}
        onPress={() => Alert.alert('Add Alarm', 'Use the system Clock app for persistent alarms.')}
      >
        <Ionicons name="add-circle" size={28} color={theme.colors.systemOrange} />
        <Text style={[typography.body, { color: theme.colors.systemOrange }]}>Add Alarm</Text>
      </Pressable>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Stopwatch Tab
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
// Timer Tab
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
export function ClockScreen({ navigation }: { navigation: any }) {
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabContent: { flex: 1, paddingHorizontal: 16 },

  // World Clock
  worldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  worldDiff: { fontSize: 13, fontWeight: '400', marginBottom: 2 },
  worldCity: { fontSize: 28, fontWeight: '300' },
  worldTime: { fontSize: 48, fontWeight: '100' },

  // Alarm
  alarmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  alarmTime: { fontSize: 48, fontWeight: '100' },
  alarmToggle: { width: 50, height: 30, borderRadius: 15, justifyContent: 'center', padding: 2 },
  alarmToggleKnob: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16 },

  // Stopwatch
  stopwatchDisplay: { fontSize: 72, fontWeight: '100', textAlign: 'center', fontVariant: ['tabular-nums'], marginVertical: 32 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 24 },
  roundBtn: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  roundBtnText: { fontSize: 16, fontWeight: '500' },
  lapsContainer: { flex: 1 },
  lapRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },

  // Timer
  timerDisplay: { fontSize: 80, fontWeight: '100', textAlign: 'center', fontVariant: ['tabular-nums'], marginVertical: 32 },
  presetRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 24 },
  presetBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,149,0,0.3)' },
  presetText: { fontSize: 15, fontWeight: '500' },
});
