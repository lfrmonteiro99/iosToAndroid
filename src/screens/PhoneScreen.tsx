import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Vibration,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Linking } from 'react-native';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';

import { useDevice, DeviceContact } from '../store/DeviceStore';
import { useTheme } from '../theme/ThemeContext';
import { CupertinoSegmentedControl } from '../components/CupertinoSegmentedControl';

// ─── Types ──────────────────────────────────────────────────────────────────

type CallStatus = 'incoming' | 'outgoing' | 'missed';

interface RecentCall {
  id: string;
  contact: DeviceContact;
  status: CallStatus;
  time: string;
  dateGroup: string;
  timestamp: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getInitials(contact: DeviceContact): string {
  const first = contact.firstName?.[0] ?? '';
  const last = contact.lastName?.[0] ?? '';
  return (first + last).toUpperCase() || '?';
}

function getFullName(contact: DeviceContact): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.phone;
}

const AVATAR_COLORS = [
  '#007AFF', '#34C759', '#FF9500', '#FF2D55',
  '#AF52DE', '#5AC8FA', '#5856D6', '#FF3B30',
  '#30B0C7', '#32ADE6',
];

function avatarColor(contact: DeviceContact): string {
  const seed = contact.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[seed % AVATAR_COLORS.length];
}

const DATE_GROUPS = ['Today', 'Yesterday', 'Monday', 'Tuesday', 'Wednesday', 'Last Week'];
const TIMES = ['9:41 AM', '2:14 PM', '7:03 PM', '11:30 AM', '4:56 PM', '8:22 AM', '1:07 PM', '6:45 PM'];
const STATUSES: CallStatus[] = ['incoming', 'outgoing', 'missed', 'outgoing', 'incoming'];

function generateRecentCalls(contacts: DeviceContact[]): RecentCall[] {
  const slice = contacts.slice(0, 15);
  return slice.map((contact, i) => ({
    id: `recent-${contact.id}-${i}`,
    contact,
    status: STATUSES[i % STATUSES.length],
    time: TIMES[i % TIMES.length],
    dateGroup: DATE_GROUPS[Math.floor(i / 3) % DATE_GROUPS.length],
    timestamp: Date.now() - i * 3_600_000,
  }));
}

const KEYPAD_ROWS = [
  [{ digit: '1', letters: '' }, { digit: '2', letters: 'ABC' }, { digit: '3', letters: 'DEF' }],
  [{ digit: '4', letters: 'GHI' }, { digit: '5', letters: 'JKL' }, { digit: '6', letters: 'MNO' }],
  [{ digit: '7', letters: 'PQRS' }, { digit: '8', letters: 'TUV' }, { digit: '9', letters: 'WXYZ' }],
  [{ digit: '*', letters: '' }, { digit: '0', letters: '+' }, { digit: '#', letters: '' }],
];

// ─── Avatar ─────────────────────────────────────────────────────────────────

function ContactAvatar({ contact, size = 40 }: { contact: DeviceContact; size?: number }) {
  const initials = getInitials(contact);
  const bg = avatarColor(contact);
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

// ─── Favorites Tab ──────────────────────────────────────────────────────────

function FavoritesTab({ contacts }: { contacts: DeviceContact[] }) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const favorites = contacts.slice(0, 8);

  const handleCall = useCallback((phone: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(`tel:${phone}`);
  }, []);

  if (favorites.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="star-outline" size={52} color={colors.systemGray3} />
        <Text style={[typography.title3, { color: colors.label, marginTop: 12 }]}>No Favorites</Text>
        <Text style={[typography.subhead, { color: colors.secondaryLabel, marginTop: 6, textAlign: 'center' }]}>
          Add contacts to Favorites for quick access.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={favorites}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingBottom: 20 }}
      ItemSeparatorComponent={() => (
        <View style={[styles.separator, { backgroundColor: colors.separator, marginLeft: 72 }]} />
      )}
      renderItem={({ item }) => (
        <View style={[styles.contactRow, { backgroundColor: colors.secondarySystemGroupedBackground }]}>
          <ContactAvatar contact={item} size={44} />
          <View style={styles.contactInfo}>
            <Text style={[typography.body, { color: colors.label }]} numberOfLines={1}>
              {getFullName(item)}
            </Text>
            <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>mobile</Text>
          </View>
          <TouchableOpacity
            onPress={() => handleCall(item.phone)}
            style={styles.callBtn}
            accessibilityLabel={`Call ${getFullName(item)}`}
            accessibilityRole="button"
          >
            <Ionicons name="call" size={22} color={colors.systemGreen} />
          </TouchableOpacity>
        </View>
      )}
    />
  );
}

// ─── Recents Tab ────────────────────────────────────────────────────────────

function RecentsTab({ contacts }: { contacts: DeviceContact[] }) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const recents = useMemo(() => generateRecentCalls(contacts), [contacts]);

  const grouped = useMemo(() => {
    const map = new Map<string, RecentCall[]>();
    for (const call of recents) {
      const arr = map.get(call.dateGroup) ?? [];
      arr.push(call);
      map.set(call.dateGroup, arr);
    }
    return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
  }, [recents]);

  const handleCall = useCallback((phone: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(`tel:${phone}`);
  }, []);

  const callDirectionIcon = (status: CallStatus) => {
    switch (status) {
      case 'incoming': return { name: 'arrow-down-circle' as const, color: colors.systemGreen };
      case 'outgoing': return { name: 'arrow-up-circle' as const, color: colors.systemBlue };
      case 'missed': return { name: 'close-circle' as const, color: colors.systemRed };
    }
  };

  if (recents.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="time-outline" size={52} color={colors.systemGray3} />
        <Text style={[typography.title3, { color: colors.label, marginTop: 12 }]}>No Recent Calls</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
      {grouped.map(({ title, data }) => (
        <View key={title}>
          <View style={[styles.sectionHeader, { borderBottomColor: colors.separator }]}>
            <Text style={[typography.footnote, { color: colors.secondaryLabel, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
              {title}
            </Text>
          </View>
          <View style={{ backgroundColor: colors.secondarySystemGroupedBackground }}>
            {data.map((call, idx) => {
              const icon = callDirectionIcon(call.status);
              const isMissed = call.status === 'missed';
              const isLast = idx === data.length - 1;
              return (
                <Pressable
                  key={call.id}
                  onPress={() => handleCall(call.contact.phone)}
                  style={({ pressed }) => [
                    styles.recentRow,
                    !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
                    pressed && { backgroundColor: colors.systemGray5 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${call.status} call from ${getFullName(call.contact)}, ${call.time}`}
                >
                  <View style={styles.recentLeft}>
                    <Ionicons name={icon.name} size={18} color={icon.color} style={{ marginRight: 10 }} />
                    <View>
                      <Text
                        style={[
                          typography.body,
                          { color: isMissed ? colors.systemRed : colors.label, fontWeight: isMissed ? '600' : '400' },
                        ]}
                        numberOfLines={1}
                      >
                        {getFullName(call.contact)}
                      </Text>
                      <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>
                        {call.status === 'outgoing' ? 'Outgoing' : call.status === 'missed' ? 'Missed' : 'Incoming'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.recentRight}>
                    <Text style={[typography.subhead, { color: colors.secondaryLabel }]}>{call.time}</Text>
                    <Ionicons name="information-circle-outline" size={20} color={colors.systemBlue} style={{ marginLeft: 12 }} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Contacts Tab ────────────────────────────────────────────────────────────

function ContactsTab({ contacts }: { contacts: DeviceContact[] }) {
  const { theme, typography } = useTheme();
  const { colors } = theme;

  const sorted = useMemo(
    () =>
      [...contacts].sort((a, b) =>
        getFullName(a).localeCompare(getFullName(b)),
      ),
    [contacts],
  );

  const handleCall = useCallback((phone: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(`tel:${phone}`);
  }, []);

  if (sorted.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="person-outline" size={52} color={colors.systemGray3} />
        <Text style={[typography.title3, { color: colors.label, marginTop: 12 }]}>No Contacts</Text>
        <Text style={[typography.subhead, { color: colors.secondaryLabel, marginTop: 6, textAlign: 'center', paddingHorizontal: 32 }]}>
          No contacts found. Grant permission in Settings.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={sorted}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingBottom: 20 }}
      ItemSeparatorComponent={() => (
        <View style={[styles.separator, { backgroundColor: colors.separator, marginLeft: 72 }]} />
      )}
      getItemLayout={(_, index) => ({ length: 60, offset: 60 * index, index })}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => handleCall(item.phone)}
          style={({ pressed }) => [
            styles.contactRow,
            { backgroundColor: pressed ? colors.systemGray5 : colors.secondarySystemGroupedBackground },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Call ${getFullName(item)}`}
        >
          <ContactAvatar contact={item} size={44} />
          <View style={[styles.contactInfo, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
            <Text style={[typography.body, { color: colors.label }]} numberOfLines={1}>
              {getFullName(item)}
            </Text>
            <Text style={[typography.caption1, { color: colors.secondaryLabel }]} numberOfLines={1}>
              {item.phone}
            </Text>
          </View>
        </Pressable>
      )}
    />
  );
}

// ─── Keypad Tab ──────────────────────────────────────────────────────────────

function KeypadTab() {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const [number, setNumber] = useState('');

  const handleDigit = useCallback((digit: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNumber((prev) => prev + digit);
  }, []);

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNumber((prev) => prev.slice(0, -1));
  }, []);

  const handleCall = useCallback(() => {
    if (!number) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Linking.openURL(`tel:${number}`);
  }, [number]);

  const keypadBg = theme.dark ? colors.systemGray4 : colors.systemGray5;

  return (
    <View style={[styles.keypadContainer, { paddingBottom: insets.bottom + 16 }]}>
      {/* Display */}
      <View style={styles.keypadDisplay}>
        <Text
          style={[
            styles.keypadNumber,
            { color: colors.label },
            number.length > 12 && { fontSize: 24 },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {number || ''}
        </Text>
        {number.length > 0 && (
          <TouchableOpacity
            onPress={handleDelete}
            onLongPress={() => setNumber('')}
            style={styles.keypadDeleteDisplay}
            accessibilityLabel="Delete digit"
          >
            <Ionicons name="backspace-outline" size={26} color={colors.secondaryLabel} />
          </TouchableOpacity>
        )}
      </View>

      {/* Grid */}
      <View style={styles.keypadGrid}>
        {KEYPAD_ROWS.map((row, ri) => (
          <View key={ri} style={styles.keypadRow}>
            {row.map(({ digit, letters }) => (
              <TouchableOpacity
                key={digit}
                onPress={() => handleDigit(digit)}
                activeOpacity={0.7}
                style={[styles.keypadKey, { backgroundColor: keypadBg }]}
                accessibilityLabel={digit}
                accessibilityRole="button"
              >
                <Text style={[styles.keypadDigit, { color: colors.label }]}>{digit}</Text>
                {letters !== '' && (
                  <Text style={[styles.keypadLetters, { color: colors.label }]}>{letters}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>

      {/* Action Row */}
      <View style={styles.keypadActions}>
        {/* Spacer left */}
        <View style={styles.keypadActionSlot} />

        {/* Call Button */}
        <TouchableOpacity
          onPress={handleCall}
          style={[
            styles.keypadCallButton,
            { backgroundColor: number ? colors.systemGreen : colors.systemGray4 },
          ]}
          disabled={!number}
          accessibilityLabel="Call"
          accessibilityRole="button"
        >
          <Ionicons name="call" size={30} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Backspace right */}
        <View style={styles.keypadActionSlot}>
          {number.length > 0 && (
            <TouchableOpacity
              onPress={handleDelete}
              onLongPress={() => setNumber('')}
              style={styles.keypadBackspace}
              accessibilityLabel="Delete"
            >
              <Ionicons name="backspace-outline" size={28} color={colors.secondaryLabel} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Voicemail Tab ───────────────────────────────────────────────────────────

function VoicemailTab() {
  const { theme, typography } = useTheme();
  const { colors } = theme;

  const handleCallVoicemail = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL('tel:*86');
  }, []);

  return (
    <View style={styles.emptyState}>
      <View style={[styles.voicemailIconBg, { backgroundColor: colors.systemGray5 }]}>
        <Ionicons name="mail-unread-outline" size={40} color={colors.systemGray} />
      </View>
      <Text style={[typography.title3, { color: colors.label, marginTop: 16 }]}>No Voicemail</Text>
      <Text style={[typography.subhead, { color: colors.secondaryLabel, marginTop: 6, textAlign: 'center', paddingHorizontal: 40 }]}>
        Your voicemail inbox is empty.
      </Text>
      <TouchableOpacity
        onPress={handleCallVoicemail}
        style={[styles.voicemailBtn, { backgroundColor: colors.systemBlue }]}
        accessibilityRole="button"
        accessibilityLabel="Call Voicemail"
      >
        <Ionicons name="call" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
        <Text style={[typography.subhead, { color: '#FFFFFF', fontWeight: '600' }]}>Call Voicemail</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── PhoneScreen ─────────────────────────────────────────────────────────────

const TABS = ['Favorites', 'Recents', 'Contacts', 'Keypad', 'Voicemail'];

export function PhoneScreen() {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const device = useDevice();
  const [selectedTab, setSelectedTab] = useState(0);

  const handleTabChange = useCallback((index: number) => {
    setSelectedTab(index);
  }, []);

  const renderContent = () => {
    switch (selectedTab) {
      case 0: return <FavoritesTab contacts={device.contacts} />;
      case 1: return <RecentsTab contacts={device.contacts} />;
      case 2: return <ContactsTab contacts={device.contacts} />;
      case 3: return <KeypadTab />;
      case 4: return <VoicemailTab />;
      default: return null;
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.systemGroupedBackground }]}>
      {/* Navigation Bar */}
      <BlurView
        intensity={80}
        tint={theme.dark ? 'dark' : 'light'}
        style={[
          styles.navBar,
          {
            paddingTop: insets.top,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.separator,
          },
        ]}
      >
        <View style={styles.navBarContent}>
          <Text style={[typography.headline, { color: colors.label }]}>Phone</Text>
        </View>

        {/* Segmented Control */}
        <View style={styles.segmentedWrapper}>
          <CupertinoSegmentedControl
            values={TABS}
            selectedIndex={selectedTab}
            onChange={handleTabChange}
          />
        </View>
      </BlurView>

      {/* Content */}
      <View style={[styles.content, { paddingTop: insets.top + 44 + 52 }]}>
        {renderContent()}
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  navBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  navBarContent: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  segmentedWrapper: {
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  content: {
    flex: 1,
  },
  // Avatar
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  // Shared row
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    minHeight: 60,
  },
  contactInfo: {
    flex: 1,
    paddingRight: 16,
    paddingVertical: 10,
  },
  callBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  // Section header
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Recents
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    minHeight: 56,
  },
  recentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  recentRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  voicemailIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voicemailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  // Keypad
  keypadContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  keypadDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
    marginBottom: 8,
    width: '100%',
    paddingHorizontal: 40,
  },
  keypadNumber: {
    fontSize: 40,
    fontWeight: '300',
    letterSpacing: 2,
    textAlign: 'center',
    flex: 1,
  },
  keypadDeleteDisplay: {
    position: 'absolute',
    right: 0,
    padding: 8,
  },
  keypadGrid: {
    width: '100%',
    maxWidth: 320,
    marginBottom: 12,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  keypadKey: {
    width: 75,
    height: 75,
    borderRadius: 37.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadDigit: {
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 34,
  },
  keypadLetters: {
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 1.5,
    marginTop: -4,
  },
  keypadActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 320,
    marginBottom: 8,
  },
  keypadActionSlot: {
    width: 75,
    height: 75,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadCallButton: {
    width: 75,
    height: 75,
    borderRadius: 37.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadBackspace: {
    width: 75,
    height: 75,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
