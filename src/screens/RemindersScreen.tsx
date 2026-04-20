import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  StyleSheet,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { withAutoLockSuppressed } from '../utils/permissions';
import { useTheme } from '../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoSwipeableRow,
  CupertinoEmptyState,
} from '../components';
import type { AppNavigationProp } from '../navigation/types';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Reminder {
  id: string;
  title: string;
  notes: string;
  completed: boolean;
  flagged: boolean;
  dueDate?: number;
  notificationId?: string;
  listName: string;
  createdAt: number;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
}

type FilterMode = 'home' | 'list';

interface ListMeta {
  name: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = '@iostoandroid/reminders';
const LISTS_STORAGE_KEY = '@iostoandroid/reminder_lists';
const REMINDERS_ACCENT = '#FF9500';
const LIST_COLOR_OPTIONS = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#5856D6', '#AF52DE', '#FF2D55', '#00C7BE'];

const DEFAULT_LISTS: ListMeta[] = [
  { name: 'Reminders', color: '#007AFF', icon: 'list-circle-outline' },
  { name: 'Work', color: '#34C759', icon: 'briefcase-outline' },
  { name: 'Personal', color: '#FF9500', icon: 'person-outline' },
];

// Smart lists
const SMART_LISTS = [
  { key: 'today', label: 'Today', color: '#007AFF', icon: 'today-outline' as keyof typeof Ionicons.glyphMap },
  { key: 'scheduled', label: 'Scheduled', color: '#FF3B30', icon: 'calendar-outline' as keyof typeof Ionicons.glyphMap },
  { key: 'all', label: 'All', color: '#5856D6', icon: 'tray-outline' as keyof typeof Ionicons.glyphMap },
  { key: 'flagged', label: 'Flagged', color: '#FF9500', icon: 'flag-outline' as keyof typeof Ionicons.glyphMap },
];

// ─── Notification Helpers ────────────────────────────────────────────────────

async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await withAutoLockSuppressed(() => Notifications.requestPermissionsAsync());
    return status === 'granted';
  } catch {
    return false;
  }
}

async function scheduleReminderNotification(reminder: Reminder): Promise<string | undefined> {
  if (!reminder.dueDate) return undefined;
  const dueDate = new Date(reminder.dueDate);
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return undefined;

    let trigger: Notifications.NotificationTriggerInput;
    if (reminder.recurrence === 'daily') {
      trigger = {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        hour: dueDate.getHours(),
        minute: dueDate.getMinutes(),
        repeats: true,
      };
    } else if (reminder.recurrence === 'weekly') {
      // Expo WeeklyTriggerInput.weekday is 1..7 with 1 = Sunday.
      // Date.getDay() is 0..6 with 0 = Sunday. Hence +1.
      // See https://docs.expo.dev/versions/latest/sdk/notifications/#weeklytriggerinput
      trigger = {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        weekday: dueDate.getDay() + 1,
        hour: dueDate.getHours(),
        minute: dueDate.getMinutes(),
        repeats: true,
      };
    } else if (reminder.recurrence === 'monthly') {
      trigger = {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        day: dueDate.getDate(),
        hour: dueDate.getHours(),
        minute: dueDate.getMinutes(),
        repeats: true,
      };
    } else {
      if (dueDate <= new Date()) return undefined;
      trigger = { type: Notifications.SchedulableTriggerInputTypes.DATE, date: dueDate };
    }

    return await Notifications.scheduleNotificationAsync({
      content: { title: 'Reminder', body: reminder.title },
      trigger,
    });
  } catch {
    return undefined;
  }
}

async function cancelReminderNotification(notificationId: string | undefined): Promise<void> {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // ignore cancellation errors
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function startOfTomorrow(): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

function startOfNextWeek(): number {
  const d = new Date();
  const daysUntilMonday = ((8 - d.getDay()) % 7) || 7;
  d.setDate(d.getDate() + daysUntilMonday);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

function todayAt9(): number {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

function isToday(timestamp: number): boolean {
  const d = new Date(timestamp);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function formatDueDate(timestamp: number): string {
  const d = new Date(timestamp);
  if (isToday(timestamp)) return 'Today';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ─── Checkbox Component ─────────────────────────────────────────────────────

interface CheckboxProps {
  checked: boolean;
  color: string;
  onToggle: () => void;
}

function Checkbox({ checked, color, onToggle }: CheckboxProps) {
  return (
    <Pressable onPress={onToggle} hitSlop={8} style={styles.checkbox}>
      <View
        style={[
          styles.checkboxOuter,
          { borderColor: checked ? color : '#C7C7CC' },
          checked && { backgroundColor: color, borderColor: color },
        ]}
      >
        {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
      </View>
    </Pressable>
  );
}

// ─── Reminder Row ───────────────────────────────────────────────────────────

interface ReminderRowProps {
  reminder: Reminder;
  listColor: string;
  now: number;
  onToggle: () => void;
  onDelete: () => void;
  onFlag: () => void;
  onEdit: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  colors: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typography: any;
  isOpen: boolean;
  onOpen: () => void;
}

const ReminderRow = React.memo(function ReminderRow({
  reminder,
  listColor,
  now,
  onToggle,
  onDelete,
  onFlag,
  onEdit,
  colors,
  typography,
  isOpen,
  onOpen,
}: ReminderRowProps) {
  return (
    <CupertinoSwipeableRow
      isOpen={isOpen}
      onOpen={onOpen}
      trailingActions={[
        { label: 'Delete', color: colors.systemRed, onPress: onDelete },
        {
          label: reminder.flagged ? 'Unflag' : 'Flag',
          color: '#FF9500',
          onPress: onFlag,
        },
      ]}
    >
      <Pressable
        onPress={onEdit}
        style={[
          styles.reminderRow,
          { backgroundColor: colors.secondarySystemGroupedBackground },
        ]}
      >
        <Checkbox checked={reminder.completed} color={listColor} onToggle={onToggle} />
        <View style={[styles.reminderContent, { borderBottomColor: colors.separator }]}>
          <View style={styles.reminderTextContainer}>
            <Text
              style={[
                typography.body,
                {
                  color: reminder.completed ? colors.tertiaryLabel : colors.label,
                  textDecorationLine: reminder.completed ? 'line-through' : 'none',
                },
              ]}
              numberOfLines={1}
            >
              {reminder.title}
            </Text>
            {reminder.notes ? (
              <Text
                style={[typography.caption1, { color: colors.secondaryLabel }]}
                numberOfLines={1}
              >
                {reminder.notes}
              </Text>
            ) : null}
            {reminder.dueDate ? (
              <Text
                style={[
                  typography.caption2,
                  {
                    color:
                      reminder.dueDate < now && !reminder.completed
                        ? colors.systemRed
                        : colors.tertiaryLabel,
                  },
                ]}
              >
                {formatDueDate(reminder.dueDate)}
              </Text>
            ) : null}
          </View>
          {reminder.flagged && (
            <Ionicons name="flag-outline" size={16} color="#FF9500" />
          )}
        </View>
      </Pressable>
    </CupertinoSwipeableRow>
  );
});

// ─── Smart List Card ────────────────────────────────────────────────────────

interface SmartListCardProps {
  label: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  count: number;
  onPress: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  themeColors: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typography: any;
}

const SmartListCard = React.memo(function SmartListCard({
  label,
  color,
  icon,
  count,
  onPress,
  themeColors,
  typography,
}: SmartListCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.smartCard,
        {
          backgroundColor: pressed
            ? themeColors.systemGray5
            : themeColors.secondarySystemGroupedBackground,
        },
      ]}
    >
      <View style={styles.smartCardTop}>
        <View style={[styles.smartCardIcon, { backgroundColor: color }]}>
          <Ionicons name={icon} size={18} color="#fff" />
        </View>
        <Text style={[typography.title2, { color: themeColors.label, fontWeight: '700' }]}>
          {count}
        </Text>
      </View>
      <Text
        style={[
          typography.caption1,
          { color: themeColors.secondaryLabel, fontWeight: '600', marginTop: 4 },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
});

// ─── Main Screen ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function RemindersScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  // ── State ───────────────────────────────────────────────────
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<FilterMode>('home');
  const [activeFilter, setActiveFilter] = useState<string>(''); // smart list key or list name
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState<number | undefined>(undefined);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const addInputRef = useRef<TextInput>(null);
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  // Custom lists
  const [customLists, setCustomLists] = useState<ListMeta[]>([]);
  const [showCreateListModal, setShowCreateListModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListColor, setNewListColor] = useState(LIST_COLOR_OPTIONS[0]);

  // Edit reminder
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editDueDate, setEditDueDate] = useState<number | undefined>(undefined);
  const [editRecurrence, setEditRecurrence] = useState<Reminder['recurrence']>('none');
  const [showEditDuePicker, setShowEditDuePicker] = useState(false);
  const [editCustomHour, setEditCustomHour] = useState('9');
  const [editCustomMinute, setEditCustomMinute] = useState('00');

  // Custom date picker for new reminders
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [customHour, setCustomHour] = useState('9');
  const [customMinute, setCustomMinute] = useState('00');

  // ── Persistence ─────────────────────────────────────────────

  const persistReminders = useCallback(async (updated: Reminder[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // silently fail
    }
  }, []);

  // Load reminders and custom lists on mount
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(LISTS_STORAGE_KEY),
    ]).then(([rawReminders, rawLists]) => {
      if (cancelled) return;
      if (rawReminders) {
        try { setReminders(JSON.parse(rawReminders)); } catch { /* ignore */ }
      }
      if (rawLists) {
        try { setCustomLists(JSON.parse(rawLists)); } catch { /* ignore */ }
      }
      setLoaded(true);
    }).catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  // ── Counts ──────────────────────────────────────────────────
  // Update currentTime every minute so "today" calculations stay accurate across midnight
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const counts = useMemo(() => {
    const now = currentTime;
    return {
      today: reminders.filter(
        (r) => !r.completed && r.dueDate && isToday(r.dueDate),
      ).length,
      scheduled: reminders.filter(
        (r) => !r.completed && r.dueDate && r.dueDate > now,
      ).length,
      all: reminders.filter((r) => !r.completed).length,
      flagged: reminders.filter((r) => !r.completed && r.flagged).length,
    };
  }, [reminders, currentTime]);

  // ── Filtered Reminders ──────────────────────────────────────

  const filteredReminders = useMemo(() => {
    if (viewMode === 'home') return [];

    let result: Reminder[];
    switch (activeFilter) {
      case 'today':
        result = reminders.filter(
          (r) => r.dueDate && isToday(r.dueDate),
        );
        break;
      case 'scheduled':
        result = reminders.filter((r) => r.dueDate != null);
        break;
      case 'all':
        result = reminders;
        break;
      case 'flagged':
        result = reminders.filter((r) => r.flagged);
        break;
      default:
        // User list
        result = reminders.filter((r) => r.listName === activeFilter);
        break;
    }

    // Sort: incomplete first, then by createdAt desc
    return result.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return b.createdAt - a.createdAt;
    });
  }, [reminders, viewMode, activeFilter]);

  // ── All lists (default + custom) — must be before activeListColor ──────
  const allLists = useMemo(() => [...DEFAULT_LISTS, ...customLists], [customLists]);

  // ── Active list color ───────────────────────────────────────

  const activeListColor = useMemo(() => {
    const smart = SMART_LISTS.find((s) => s.key === activeFilter);
    if (smart) return smart.color;
    const userList = allLists.find((l) => l.name === activeFilter);
    return userList?.color ?? REMINDERS_ACCENT;
  }, [activeFilter, allLists]);

  // ── Actions ─────────────────────────────────────────────────

  const toggleReminder = useCallback(
    (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const reminder = reminders.find((r) => r.id === id);
      // When marking a reminder as completed, cancel any pending notification
      if (reminder && !reminder.completed && reminder.notificationId) {
        cancelReminderNotification(reminder.notificationId);
      }
      const updated = reminders.map((r) =>
        r.id === id ? { ...r, completed: !r.completed } : r,
      );
      setReminders(updated);
      persistReminders(updated);
    },
    [reminders, persistReminders],
  );

  const toggleFlag = useCallback(
    (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const updated = reminders.map((r) =>
        r.id === id ? { ...r, flagged: !r.flagged } : r,
      );
      setReminders(updated);
      persistReminders(updated);
    },
    [reminders, persistReminders],
  );

  const deleteReminder = useCallback(
    (id: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      const reminder = reminders.find((r) => r.id === id);
      if (reminder?.notificationId) {
        cancelReminderNotification(reminder.notificationId);
      }
      const updated = reminders.filter((r) => r.id !== id);
      setReminders(updated);
      persistReminders(updated);
    },
    [reminders, persistReminders],
  );

  const addReminder = useCallback(async () => {
    if (!newTitle.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const listName =
      !activeFilter ||
      SMART_LISTS.some((s) => s.key === activeFilter)
        ? 'Reminders'
        : activeFilter;

    const newReminder: Reminder = {
      id: generateId(),
      title: newTitle.trim(),
      notes: '',
      completed: false,
      flagged: false,
      dueDate: newDueDate,
      listName,
      createdAt: Date.now(),
    };

    // Schedule a local notification if the reminder has a future dueDate
    if (newReminder.dueDate) {
      const notificationId = await scheduleReminderNotification(newReminder);
      if (notificationId) {
        newReminder.notificationId = notificationId;
      }
    }

    const updated = [...reminders, newReminder];
    setReminders(updated);
    persistReminders(updated);
    setNewTitle('');
    setNewDueDate(undefined);
    setShowDatePicker(false);
  }, [newTitle, newDueDate, reminders, persistReminders, activeFilter]);

  const handleCreateList = useCallback(() => {
    if (!newListName.trim()) return;
    const list: ListMeta = {
      name: newListName.trim(),
      color: newListColor,
      icon: 'list-outline' as keyof typeof Ionicons.glyphMap,
    };
    const updated = [...customLists, list];
    setCustomLists(updated);
    AsyncStorage.setItem(LISTS_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
    setNewListName('');
    setNewListColor(LIST_COLOR_OPTIONS[0]);
    setShowCreateListModal(false);
  }, [newListName, newListColor, customLists]);

  const openEditReminder = useCallback((reminder: Reminder) => {
    setEditingReminder(reminder);
    setEditTitle(reminder.title);
    setEditNotes(reminder.notes);
    setEditDueDate(reminder.dueDate);
    setEditRecurrence(reminder.recurrence ?? 'none');
    setShowEditDuePicker(false);
  }, []);

  const saveEditReminder = useCallback(async () => {
    if (!editingReminder || !editTitle.trim()) return;
    if (editingReminder.notificationId) {
      await cancelReminderNotification(editingReminder.notificationId);
    }
    const updated: Reminder = {
      ...editingReminder,
      title: editTitle.trim(),
      notes: editNotes,
      dueDate: editDueDate,
      recurrence: editRecurrence,
      notificationId: undefined,
    };
    if (updated.dueDate) {
      const notificationId = await scheduleReminderNotification(updated);
      if (notificationId) updated.notificationId = notificationId;
    }
    const updatedList = reminders.map((r) => (r.id === updated.id ? updated : r));
    setReminders(updatedList);
    persistReminders(updatedList);
    setEditingReminder(null);
  }, [editingReminder, editTitle, editNotes, editDueDate, editRecurrence, reminders, persistReminders]);

  const openList = useCallback((filter: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveFilter(filter);
    setViewMode('list');
  }, []);

  const goHome = useCallback(() => {
    Keyboard.dismiss();
    setShowAddReminder(false);
    setNewTitle('');
    setNewDueDate(undefined);
    setShowDatePicker(false);
    setViewMode('home');
    setActiveFilter('');
  }, []);

  // ── List counts (must be above early returns to satisfy hooks rules) ────
  const listCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of allLists) {
      c[l.name] = reminders.filter(
        (r) => !r.completed && r.listName === l.name,
      ).length;
    }
    return c;
  }, [reminders, allLists]);

  // ── Render: List View ──────────────────────────────────────

  if (viewMode === 'list') {
    const filterLabel =
      SMART_LISTS.find((s) => s.key === activeFilter)?.label ?? activeFilter;

    const renderReminderRow = ({ item }: { item: Reminder }) => (
      <ReminderRow
        reminder={item}
        listColor={activeListColor}
        now={currentTime}
        onToggle={() => toggleReminder(item.id)}
        onDelete={() => deleteReminder(item.id)}
        onFlag={() => toggleFlag(item.id)}
        onEdit={() => openEditReminder(item)}
        colors={colors}
        typography={typography}
        isOpen={openRowId === item.id}
        onOpen={() => setOpenRowId(item.id)}
      />
    );

    const renderEmpty = () => {
      if (!loaded) return null;
      return (
        <View style={styles.emptyContainer}>
          <CupertinoEmptyState
            icon="checkmark-circle-outline"
            title="No Reminders"
            message="Tap the + button to add a new reminder."
            iconColor={activeListColor}
          />
        </View>
      );
    };

    return (
      <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
        <CupertinoNavigationBar
          title={filterLabel}
          largeTitle={false}
          leftButton={
            <Pressable onPress={goHome} style={styles.navButton} hitSlop={8}>
              <Ionicons name="chevron-back" size={24} color={REMINDERS_ACCENT} />
              <Text style={[typography.body, { color: REMINDERS_ACCENT }]}>Lists</Text>
            </Pressable>
          }
          rightButton={
            <Pressable
              onPress={() => {
                setShowAddReminder(true);
                setTimeout(() => addInputRef.current?.focus(), 100);
              }}
              hitSlop={8}
            >
              <Ionicons name="add-circle" size={28} color={REMINDERS_ACCENT} />
            </Pressable>
          }
        />

        <KeyboardAvoidingView
          style={styles.flex1}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <FlatList
            data={filteredReminders}
            renderItem={renderReminderRow}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={renderEmpty}
            contentContainerStyle={{
              paddingBottom: insets.bottom + 90,
              flexGrow: filteredReminders.length === 0 ? 1 : undefined,
            }}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
          />

          {/* Inline add reminder */}
          {showAddReminder && (
            <View
              style={[
                styles.addReminderBar,
                {
                  paddingBottom: insets.bottom + 8,
                  backgroundColor: colors.secondarySystemGroupedBackground,
                  borderTopColor: colors.separator,
                },
              ]}
            >
              <View style={styles.addReminderRow}>
                <Checkbox checked={false} color={activeListColor} onToggle={() => {}} />
                <TextInput
                  ref={addInputRef}
                  style={[typography.body, styles.addReminderInput, { color: colors.label }]}
                  placeholder="New Reminder"
                  placeholderTextColor={colors.tertiaryLabel}
                  value={newTitle}
                  onChangeText={setNewTitle}
                  onSubmitEditing={addReminder}
                  returnKeyType="done"
                />
                <Pressable
                  onPress={() => setShowDatePicker((v) => !v)}
                  hitSlop={8}
                  style={{ marginLeft: 8 }}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color={newDueDate ? REMINDERS_ACCENT : colors.secondaryLabel}
                  />
                </Pressable>
                <Pressable onPress={addReminder} hitSlop={8} style={{ marginLeft: 12 }}>
                  <Text style={[typography.body, { color: REMINDERS_ACCENT, fontWeight: '600' }]}>
                    Add
                  </Text>
                </Pressable>
              </View>

              {showDatePicker && (
                <View>
                  <View style={styles.dateChipsRow}>
                    {[
                      { label: 'Today', value: todayAt9() },
                      { label: 'Tomorrow', value: startOfTomorrow() },
                      { label: 'Next Week', value: startOfNextWeek() },
                    ].map((chip) => {
                      const selected = newDueDate === chip.value;
                      return (
                        <Pressable
                          key={chip.label}
                          onPress={() => { setNewDueDate(selected ? undefined : chip.value); setShowCustomDatePicker(false); }}
                          style={[styles.dateChip, { backgroundColor: selected ? REMINDERS_ACCENT : colors.systemGray5 }]}
                        >
                          <Text style={[typography.caption1, { color: selected ? '#fff' : colors.label, fontWeight: '600' }]}>
                            {chip.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={() => setShowCustomDatePicker((v) => !v)}
                      style={[styles.dateChip, { backgroundColor: showCustomDatePicker ? REMINDERS_ACCENT : colors.systemGray5 }]}
                    >
                      <Text style={[typography.caption1, { color: showCustomDatePicker ? '#fff' : colors.label, fontWeight: '600' }]}>
                        Custom…
                      </Text>
                    </Pressable>
                  </View>
                  {showCustomDatePicker && (
                    <View style={{ paddingLeft: 32 }}>
                      <View style={styles.customPickerRow}>
                        {Array.from({ length: 7 }, (_, i) => {
                          const d = new Date();
                          d.setDate(d.getDate() + i + 1);
                          d.setHours(parseInt(customHour, 10) || 9, parseInt(customMinute, 10) || 0, 0, 0);
                          const label = i === 0 ? 'Tmrw' : d.toLocaleDateString([], { weekday: 'short' });
                          const ts = d.getTime();
                          return (
                            <Pressable
                              key={i}
                              onPress={() => setNewDueDate(ts)}
                              style={[styles.customDayChip, { backgroundColor: newDueDate === ts ? REMINDERS_ACCENT : colors.systemGray5 }]}
                            >
                              <Text style={[typography.caption2, { color: newDueDate === ts ? '#fff' : colors.label }]}>{label}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <View style={styles.customTimeRow}>
                        <TextInput
                          style={[typography.body, styles.timeInput, { color: colors.label, borderColor: colors.separator }]}
                          value={customHour}
                          onChangeText={setCustomHour}
                          keyboardType="number-pad"
                          maxLength={2}
                          placeholder="HH"
                          placeholderTextColor={colors.tertiaryLabel}
                        />
                        <Text style={[typography.body, { color: colors.label }]}>:</Text>
                        <TextInput
                          style={[typography.body, styles.timeInput, { color: colors.label, borderColor: colors.separator }]}
                          value={customMinute}
                          onChangeText={setCustomMinute}
                          keyboardType="number-pad"
                          maxLength={2}
                          placeholder="MM"
                          placeholderTextColor={colors.tertiaryLabel}
                        />
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
        </KeyboardAvoidingView>

        {/* Bottom toolbar */}
        {!showAddReminder && (
          <View
            style={[
              styles.bottomToolbar,
              {
                paddingBottom: insets.bottom + 8,
                borderTopColor: colors.separator,
                backgroundColor: colors.systemGroupedBackground,
              },
            ]}
          >
            <Pressable
              onPress={() => {
                setShowAddReminder(true);
                setTimeout(() => addInputRef.current?.focus(), 100);
              }}
              style={styles.addButton}
              hitSlop={8}
            >
              <Ionicons name="add-circle-outline" size={22} color={REMINDERS_ACCENT} />
              <Text
                style={[
                  typography.body,
                  { color: REMINDERS_ACCENT, fontWeight: '600', marginLeft: 6 },
                ]}
              >
                New Reminder
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  // ── Render: Home View ──────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Reminders"
        largeTitle={false}
        leftButton={
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={REMINDERS_ACCENT} />
          </Pressable>
        }
      />

      <FlatList
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={
          <View style={styles.homeContent}>
            {/* Smart list cards */}
            <View style={styles.smartCardsGrid}>
              {SMART_LISTS.map((sl) => (
                <SmartListCard
                  key={sl.key}
                  label={sl.label}
                  color={sl.color}
                  icon={sl.icon}
                  count={counts[sl.key as keyof typeof counts]}
                  onPress={() => openList(sl.key)}
                  themeColors={colors}
                  typography={typography}
                />
              ))}
            </View>

            {/* My Lists section */}
            <View style={styles.myListsHeader}>
              <Text
                style={[
                  typography.title3,
                  { color: colors.label, fontWeight: '700' },
                ]}
              >
                My Lists
              </Text>
              <Pressable onPress={() => setShowCreateListModal(true)} hitSlop={8}>
                <Text style={[typography.body, { color: REMINDERS_ACCENT, fontWeight: '600' }]}>
                  Add List
                </Text>
              </Pressable>
            </View>

            {allLists.map((list) => (
              <Pressable
                key={list.name}
                onPress={() => openList(list.name)}
                style={({ pressed }) => [
                  styles.listRow,
                  {
                    backgroundColor: pressed
                      ? colors.systemGray5
                      : colors.secondarySystemGroupedBackground,
                  },
                ]}
              >
                <View style={[styles.listIcon, { backgroundColor: list.color }]}>
                  <Ionicons name={list.icon} size={18} color="#fff" />
                </View>
                <Text style={[typography.body, { color: colors.label, flex: 1, marginLeft: 12 }]}>
                  {list.name}
                </Text>
                <Text style={[typography.body, { color: colors.secondaryLabel, marginRight: 8 }]}>
                  {listCounts[list.name] ?? 0}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.tertiaryLabel} />
              </Pressable>
            ))}
          </View>
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      />

      {/* Create List Modal */}
      <Modal visible={showCreateListModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.systemBackground }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => { setShowCreateListModal(false); setNewListName(''); }}>
              <Text style={[typography.body, { color: REMINDERS_ACCENT }]}>Cancel</Text>
            </Pressable>
            <Text style={[typography.headline, { color: colors.label }]}>New List</Text>
            <Pressable onPress={handleCreateList} disabled={!newListName.trim()}>
              <Text style={[typography.body, { color: REMINDERS_ACCENT, fontWeight: '600', opacity: newListName.trim() ? 1 : 0.4 }]}>
                Done
              </Text>
            </Pressable>
          </View>
          <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
            <TextInput
              style={[typography.body, styles.modalInput, { color: colors.label, borderColor: colors.separator }]}
              placeholder="List Name"
              placeholderTextColor={colors.tertiaryLabel}
              value={newListName}
              onChangeText={setNewListName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreateList}
            />
            <Text style={[typography.caption1, { color: colors.secondaryLabel, marginTop: 20, marginBottom: 10 }]}>
              Color
            </Text>
            <View style={styles.colorSwatches}>
              {LIST_COLOR_OPTIONS.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => setNewListColor(color)}
                  style={[styles.colorSwatch, { backgroundColor: color, borderWidth: newListColor === color ? 3 : 0, borderColor: colors.label }]}
                />
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Reminder Modal */}
      <Modal visible={editingReminder !== null} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.systemBackground }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setEditingReminder(null)}>
              <Text style={[typography.body, { color: REMINDERS_ACCENT }]}>Cancel</Text>
            </Pressable>
            <Text style={[typography.headline, { color: colors.label }]}>Edit Reminder</Text>
            <Pressable onPress={saveEditReminder} disabled={!editTitle.trim()}>
              <Text style={[typography.body, { color: REMINDERS_ACCENT, fontWeight: '600', opacity: editTitle.trim() ? 1 : 0.4 }]}>
                Done
              </Text>
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <TextInput
              style={[typography.body, styles.modalInput, { color: colors.label, borderColor: colors.separator }]}
              placeholder="Title"
              placeholderTextColor={colors.tertiaryLabel}
              value={editTitle}
              onChangeText={setEditTitle}
              returnKeyType="next"
            />
            <TextInput
              style={[typography.body, styles.modalInput, { color: colors.label, borderColor: colors.separator, marginTop: 12 }]}
              placeholder="Notes"
              placeholderTextColor={colors.tertiaryLabel}
              value={editNotes}
              onChangeText={setEditNotes}
              multiline
              returnKeyType="done"
            />

            {/* Due date */}
            <Text style={[typography.caption1, { color: colors.secondaryLabel, marginTop: 20, marginBottom: 8 }]}>
              Due Date
            </Text>
            <View style={styles.dateChipsRow}>
              {[
                { label: 'None', value: undefined },
                { label: 'Today', value: todayAt9() },
                { label: 'Tomorrow', value: startOfTomorrow() },
                { label: 'Next Week', value: startOfNextWeek() },
              ].map((chip) => {
                const selected = chip.value === undefined ? editDueDate === undefined : editDueDate === chip.value;
                return (
                  <Pressable
                    key={chip.label}
                    onPress={() => { setEditDueDate(chip.value); setShowEditDuePicker(false); }}
                    style={[styles.dateChip, { backgroundColor: selected ? REMINDERS_ACCENT : colors.systemGray5 }]}
                  >
                    <Text style={[typography.caption1, { color: selected ? '#fff' : colors.label, fontWeight: '600' }]}>
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setShowEditDuePicker((v) => !v)}
                style={[styles.dateChip, { backgroundColor: showEditDuePicker ? REMINDERS_ACCENT : colors.systemGray5 }]}
              >
                <Text style={[typography.caption1, { color: showEditDuePicker ? '#fff' : colors.label, fontWeight: '600' }]}>
                  Custom…
                </Text>
              </Pressable>
            </View>
            {showEditDuePicker && (
              <View style={styles.customPickerRow}>
                {Array.from({ length: 7 }, (_, i) => {
                  const d = new Date();
                  d.setDate(d.getDate() + i + 1);
                  d.setHours(parseInt(editCustomHour, 10) || 9, parseInt(editCustomMinute, 10) || 0, 0, 0);
                  const label = i === 0 ? 'Tmrw' : d.toLocaleDateString([], { weekday: 'short' });
                  const ts = d.getTime();
                  return (
                    <Pressable
                      key={i}
                      onPress={() => setEditDueDate(ts)}
                      style={[styles.customDayChip, { backgroundColor: editDueDate === ts ? REMINDERS_ACCENT : colors.systemGray5 }]}
                    >
                      <Text style={[typography.caption2, { color: editDueDate === ts ? '#fff' : colors.label }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {showEditDuePicker && (
              <View style={styles.customTimeRow}>
                <TextInput
                  style={[typography.body, styles.timeInput, { color: colors.label, borderColor: colors.separator }]}
                  value={editCustomHour}
                  onChangeText={setEditCustomHour}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="HH"
                  placeholderTextColor={colors.tertiaryLabel}
                />
                <Text style={[typography.body, { color: colors.label }]}>:</Text>
                <TextInput
                  style={[typography.body, styles.timeInput, { color: colors.label, borderColor: colors.separator }]}
                  value={editCustomMinute}
                  onChangeText={setEditCustomMinute}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="MM"
                  placeholderTextColor={colors.tertiaryLabel}
                />
              </View>
            )}

            {/* Recurrence */}
            <Text style={[typography.caption1, { color: colors.secondaryLabel, marginTop: 20, marginBottom: 8 }]}>
              Repeat
            </Text>
            <View style={styles.dateChipsRow}>
              {(['none', 'daily', 'weekly', 'monthly'] as const).map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setEditRecurrence(r)}
                  style={[styles.dateChip, { backgroundColor: editRecurrence === r ? REMINDERS_ACCENT : colors.systemGray5 }]}
                >
                  <Text style={[typography.caption1, { color: editRecurrence === r ? '#fff' : colors.label, fontWeight: '600' }]}>
                    {r === 'none' ? 'Never' : r.charAt(0).toUpperCase() + r.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex1: {
    flex: 1,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Home
  homeContent: {
    paddingTop: 8,
  },
  smartCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 12,
  },
  smartCard: {
    width: '47%',
    padding: 14,
    borderRadius: 12,
  },
  smartCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  smartCardIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // List rows
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 2,
    borderRadius: 10,
  },
  listIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Reminder rows
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 16,
    paddingTop: 10,
  },
  reminderContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    paddingRight: 16,
    marginLeft: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reminderTextContainer: {
    flex: 1,
  },

  // Checkbox
  checkbox: {
    marginTop: 2,
  },
  checkboxOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Add reminder bar
  addReminderBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addReminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addReminderInput: {
    flex: 1,
    marginLeft: 10,
    paddingVertical: 4,
  },
  dateChipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 10,
    paddingLeft: 32,
  },
  dateChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },

  // Bottom toolbar
  bottomToolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Home my-lists header
  myListsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 12,
  },

  // Modal
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  modalInput: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },

  // Color swatches
  colorSwatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },

  // Custom date picker
  customPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  customDayChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  customTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  timeInput: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    width: 50,
    textAlign: 'center',
    paddingVertical: 4,
  },

  // Empty
  emptyContainer: {
    paddingTop: 60,
    alignItems: 'center',
  },
});
