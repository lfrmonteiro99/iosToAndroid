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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoSwipeableRow,
  CupertinoEmptyState,
  useAlert,
} from '../components';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Reminder {
  id: string;
  title: string;
  notes: string;
  completed: boolean;
  flagged: boolean;
  dueDate?: number;
  listName: string;
  createdAt: number;
}

type FilterMode = 'home' | 'list';

interface ListMeta {
  name: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = '@iostoandroid/reminders';
const REMINDERS_ACCENT = '#FF9500';

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

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
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
  colors: any;
  typography: any;
}

const ReminderRow = React.memo(function ReminderRow({
  reminder,
  listColor,
  now,
  onToggle,
  onDelete,
  onFlag,
  colors,
  typography,
}: ReminderRowProps) {
  return (
    <CupertinoSwipeableRow
      trailingActions={[
        { label: 'Delete', color: colors.systemRed, onPress: onDelete },
        {
          label: reminder.flagged ? 'Unflag' : 'Flag',
          color: '#FF9500',
          onPress: onFlag,
        },
      ]}
    >
      <View
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
      </View>
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
  themeColors: any;
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
export function RemindersScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const alert = useAlert();

  // ── State ───────────────────────────────────────────────────
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<FilterMode>('home');
  const [activeFilter, setActiveFilter] = useState<string>(''); // smart list key or list name
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const addInputRef = useRef<TextInput>(null);

  // ── Persistence ─────────────────────────────────────────────

  const persistReminders = useCallback(async (updated: Reminder[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // silently fail
    }
  }, []);

  // Load reminders on mount
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (cancelled) return;
      if (raw) {
        try { setReminders(JSON.parse(raw)); } catch { /* ignore */ }
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

  // ── Active list color ───────────────────────────────────────

  const activeListColor = useMemo(() => {
    const smart = SMART_LISTS.find((s) => s.key === activeFilter);
    if (smart) return smart.color;
    const userList = DEFAULT_LISTS.find((l) => l.name === activeFilter);
    return userList?.color ?? REMINDERS_ACCENT;
  }, [activeFilter]);

  // ── Actions ─────────────────────────────────────────────────

  const toggleReminder = useCallback(
    (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
      const updated = reminders.filter((r) => r.id !== id);
      setReminders(updated);
      persistReminders(updated);
    },
    [reminders, persistReminders],
  );

  const addReminder = useCallback(() => {
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
      listName,
      createdAt: Date.now(),
    };

    const updated = [...reminders, newReminder];
    setReminders(updated);
    persistReminders(updated);
    setNewTitle('');
  }, [newTitle, reminders, persistReminders, activeFilter]);

  const openList = useCallback((filter: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveFilter(filter);
    setViewMode('list');
  }, []);

  const goHome = useCallback(() => {
    Keyboard.dismiss();
    setShowAddReminder(false);
    setNewTitle('');
    setViewMode('home');
    setActiveFilter('');
  }, []);

  // ── List counts (must be above early returns to satisfy hooks rules) ────
  const listCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of DEFAULT_LISTS) {
      c[l.name] = reminders.filter(
        (r) => !r.completed && r.listName === l.name,
      ).length;
    }
    return c;
  }, [reminders]);

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
        colors={colors}
        typography={typography}
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
                <Pressable onPress={addReminder} hitSlop={8} style={{ marginLeft: 8 }}>
                  <Text style={[typography.body, { color: REMINDERS_ACCENT, fontWeight: '600' }]}>
                    Add
                  </Text>
                </Pressable>
              </View>
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
            <Text
              style={[
                typography.title3,
                { color: colors.label, fontWeight: '700', paddingHorizontal: 16, marginTop: 24, marginBottom: 12 },
              ]}
            >
              My Lists
            </Text>

            {DEFAULT_LISTS.map((list) => (
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

  // Empty
  emptyContainer: {
    paddingTop: 60,
    alignItems: 'center',
  },
});
