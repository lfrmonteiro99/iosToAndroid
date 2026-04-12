import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Platform, ActivityIndicator, Modal, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { useAlert } from '../components';
import { CupertinoNavigationBar } from '../components';

interface CalEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  location: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const getLauncher = async () => {
  try { return (await import('../../modules/launcher-module/src')).default; }
  catch { return null; }
};

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function formatEventTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CalendarScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const today = new Date();

  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState(today);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newAllDay, setNewAllDay] = useState(false);
  const alert = useAlert();

  const handleAddEvent = useCallback(() => {
    if (!newTitle.trim()) {
      alert('Missing Title', 'Please enter an event title.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const start = new Date(selectedDate);
    start.setHours(9, 0, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(10, 0, 0, 0);
    const newEvent: CalEvent = {
      id: Date.now().toString(),
      title: newTitle.trim(),
      start: start.getTime(),
      end: end.getTime(),
      allDay: newAllDay,
      location: newLocation.trim(),
    };
    setEvents((prev) => [...prev, newEvent]);
    setNewTitle('');
    setNewLocation('');
    setNewAllDay(false);
    setShowAddEvent(false);
  }, [newTitle, newLocation, newAllDay, selectedDate, alert]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (Platform.OS !== 'android') { if (!cancelled) setLoading(false); return; }
      try {
        const mod = await getLauncher();
        if (!mod || cancelled) { if (!cancelled) setLoading(false); return; }
        const raw = await mod.getCalendarEvents(90);
        if (!cancelled) setEvents(raw);
      } catch { /* no calendar access */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const calendarDays: (number | null)[] = Array.from({ length: firstDay }, () => null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const selectedEvents = events.filter((e) => {
    const eventDate = new Date(e.start);
    return isSameDay(eventDate, selectedDate);
  });

  const eventDates = new Set(events.map((e) => {
    const d = new Date(e.start);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }));

  return (
    <View style={[styles.container, { backgroundColor: colors.systemBackground }]}>
      <CupertinoNavigationBar
        title={`${MONTHS[viewMonth]} ${viewYear}`}
        leftButton={
          <Text style={[typography.body, { color: colors.systemRed }]} onPress={() => navigation.goBack()}>
            Back
          </Text>
        }
        rightButton={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Pressable onPress={() => { setViewMonth(today.getMonth()); setViewYear(today.getFullYear()); setSelectedDate(today); }}>
              <Text style={[typography.body, { color: colors.systemRed }]}>Today</Text>
            </Pressable>
            <Pressable onPress={() => setShowAddEvent(true)} hitSlop={8}>
              <Ionicons name="add" size={28} color={colors.systemRed} />
            </Pressable>
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 90 }} showsVerticalScrollIndicator={false}>
        {/* Month navigation */}
        <View style={styles.monthNav}>
          <Pressable onPress={prevMonth} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.systemRed} />
          </Pressable>
          <Text style={[typography.headline, { color: colors.label }]}>
            {MONTHS[viewMonth]} {viewYear}
          </Text>
          <Pressable onPress={nextMonth} hitSlop={12}>
            <Ionicons name="chevron-forward" size={24} color={colors.systemRed} />
          </Pressable>
        </View>

        {/* Day headers */}
        <View style={styles.weekRow}>
          {DAYS.map((d) => (
            <Text key={d} style={[styles.dayHeader, { color: colors.secondaryLabel }]}>{d}</Text>
          ))}
        </View>

        {/* Calendar grid */}
        <View style={styles.calendarGrid}>
          {calendarDays.map((day, idx) => {
            if (day === null) return <View key={`empty-${idx}`} style={styles.dayCell} />;
            const cellDate = new Date(viewYear, viewMonth, day);
            const isToday = isSameDay(cellDate, today);
            const isSelected = isSameDay(cellDate, selectedDate);
            const hasEvent = eventDates.has(`${viewYear}-${viewMonth}-${day}`);

            return (
              <Pressable
                key={day}
                style={styles.dayCell}
                onPress={() => setSelectedDate(cellDate)}
              >
                <View style={[
                  styles.dayCircle,
                  isToday && !isSelected && { backgroundColor: colors.systemRed },
                  isSelected && { backgroundColor: colors.systemRed },
                ]}>
                  <Text style={[
                    styles.dayText,
                    { color: (isToday || isSelected) ? '#fff' : colors.label },
                  ]}>
                    {day}
                  </Text>
                </View>
                {hasEvent && <View style={[styles.eventDot, { backgroundColor: colors.systemRed }]} />}
              </Pressable>
            );
          })}
        </View>

        {/* Events for selected date */}
        <View style={[styles.eventSection, { borderTopColor: colors.separator }]}>
          <Text style={[typography.headline, { color: colors.label, marginBottom: spacing.sm }]}>
            {isSameDay(selectedDate, today)
              ? 'Today'
              : selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
            }
          </Text>

          {loading ? (
            <ActivityIndicator color={colors.systemRed} style={{ marginTop: 20 }} />
          ) : selectedEvents.length === 0 ? (
            <Text style={[typography.body, { color: colors.secondaryLabel, marginTop: 12 }]}>
              No events scheduled
            </Text>
          ) : (
            selectedEvents.map((evt) => (
              <View key={evt.id} style={[styles.eventCard, { backgroundColor: colors.secondarySystemGroupedBackground }]}>
                <View style={[styles.eventBar, { backgroundColor: colors.systemRed }]} />
                <View style={styles.eventContent}>
                  <Text style={[typography.headline, { color: colors.label }]}>{evt.title}</Text>
                  <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>
                    {evt.allDay ? 'All Day' : `${formatEventTime(evt.start)} — ${formatEventTime(evt.end)}`}
                  </Text>
                  {evt.location ? (
                    <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>
                      <Ionicons name="location-outline" size={12} color={colors.secondaryLabel} /> {evt.location}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Add Event Modal */}
      <Modal visible={showAddEvent} transparent animationType="slide" onRequestClose={() => setShowAddEvent(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.secondarySystemGroupedBackground }]}>
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setShowAddEvent(false)}>
                <Text style={[typography.body, { color: colors.systemRed }]}>Cancel</Text>
              </Pressable>
              <Text style={[typography.headline, { color: colors.label }]}>New Event</Text>
              <Pressable onPress={handleAddEvent}>
                <Text style={[typography.body, { color: colors.systemRed, fontWeight: '600' }]}>Add</Text>
              </Pressable>
            </View>
            <Text style={[typography.caption1, { color: colors.secondaryLabel, marginBottom: 8, paddingHorizontal: 16 }]}>
              {selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.systemBackground, color: colors.label, borderColor: colors.separator }]}
              placeholder="Event Title"
              placeholderTextColor={colors.secondaryLabel}
              value={newTitle}
              onChangeText={setNewTitle}
              autoFocus
            />
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.systemBackground, color: colors.label, borderColor: colors.separator }]}
              placeholder="Location (optional)"
              placeholderTextColor={colors.secondaryLabel}
              value={newLocation}
              onChangeText={setNewLocation}
            />
            <Pressable
              style={[styles.allDayRow, { borderColor: colors.separator }]}
              onPress={() => setNewAllDay((v) => !v)}
            >
              <Text style={[typography.body, { color: colors.label }]}>All Day</Text>
              <View style={[styles.checkBox, newAllDay && { backgroundColor: colors.systemRed, borderColor: colors.systemRed }]}>
                {newAllDay && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  weekRow: { flexDirection: 'row', paddingHorizontal: 8 },
  dayHeader: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', paddingVertical: 8 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
  dayCell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 16, fontWeight: '400' },
  eventDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },

  eventSection: { paddingHorizontal: 16, paddingTop: 16, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  eventCard: { flexDirection: 'row', borderRadius: 10, marginBottom: 8, overflow: 'hidden' },
  eventBar: { width: 4 },
  eventContent: { flex: 1, padding: 12, gap: 2 },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContent: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  modalInput: { marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, fontSize: 16, borderWidth: StyleSheet.hairlineWidth },
  allDayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  checkBox: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: '#C7C7CC', alignItems: 'center', justifyContent: 'center' },
});
