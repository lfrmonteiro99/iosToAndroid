import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import type { CallLogEntry } from '../../modules/launcher-module/src';
import { useDevice, DeviceContact } from '../store/DeviceStore';
import { useTheme } from '../theme/ThemeContext';
import { CupertinoSegmentedControl } from '../components/CupertinoSegmentedControl';

const getLauncher = async () => {
  try {
    return (await import('../../modules/launcher-module/src')).default;
  } catch {
    return null;
  }
};

const makeCallNative = async (number: string) => {
  const mod = await getLauncher();
  if (mod) {
    await mod.makeCall(number);
  }
};

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

  const handleCall = useCallback(async (phone: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await makeCallNative(phone);
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

function RecentsTab() {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const [callLog, setCallLog] = useState<CallLogEntry[]>([]);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    (async () => {
      const mod = await getLauncher();
      if (mod) {
        try {
          const log = await mod.getCallLog(50);
          setCallLog(log);
        } catch {
          setPermissionDenied(true);
        }
      }
    })();
  }, []);

  const handleCall = useCallback(async (number: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await makeCallNative(number);
  }, []);

  const callDirectionIcon = (type: CallLogEntry['type']) => {
    switch (type) {
      case 'incoming': return { name: 'arrow-down-circle' as const, color: colors.systemGreen };
      case 'outgoing': return { name: 'arrow-up-circle' as const, color: colors.systemBlue };
      case 'missed': return { name: 'close-circle' as const, color: colors.systemRed };
      case 'rejected': return { name: 'close-circle' as const, color: colors.systemRed };
      default: return { name: 'call' as const, color: colors.systemGray };
    }
  };

  const callTypeLabel = (type: CallLogEntry['type']) => {
    switch (type) {
      case 'outgoing': return 'Outgoing';
      case 'missed': return 'Missed';
      case 'rejected': return 'Rejected';
      default: return 'Incoming';
    }
  };

  if (permissionDenied) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="time-outline" size={52} color={colors.systemGray3} />
        <Text style={[typography.title3, { color: colors.label, marginTop: 12 }]}>Call Log Unavailable</Text>
        <TouchableOpacity
          style={[styles.voicemailBtn, { backgroundColor: colors.systemBlue, marginTop: 16 }]}
          onPress={async () => {
            const mod = await getLauncher();
            if (mod) {
              try {
                const log = await mod.getCallLog(50);
                setCallLog(log);
                setPermissionDenied(false);
              } catch { /* still denied */ }
            }
          }}
          accessibilityRole="button"
        >
          <Text style={[typography.subhead, { color: '#FFFFFF', fontWeight: '600' }]}>Grant Call Log Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (callLog.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="time-outline" size={52} color={colors.systemGray3} />
        <Text style={[typography.title3, { color: colors.label, marginTop: 12 }]}>No Recent Calls</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
      <View style={{ backgroundColor: colors.secondarySystemGroupedBackground }}>
        {callLog.map((call, idx) => {
          const icon = callDirectionIcon(call.type);
          const isMissed = call.type === 'missed' || call.type === 'rejected';
          const isLast = idx === callLog.length - 1;
          const displayName = call.name && call.name !== call.number ? call.name : call.number;
          return (
            <Pressable
              key={call.id}
              onPress={() => handleCall(call.number)}
              style={({ pressed }) => [
                styles.recentRow,
                !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
                pressed && { backgroundColor: colors.systemGray5 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${call.type} call ${displayName}, ${call.dateFormatted}`}
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
                    {displayName}
                  </Text>
                  <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>
                    {callTypeLabel(call.type)}
                  </Text>
                </View>
              </View>
              <View style={styles.recentRight}>
                <Text style={[typography.subhead, { color: colors.secondaryLabel }]}>{call.dateFormatted}</Text>
                <Ionicons name="information-circle-outline" size={20} color={colors.systemBlue} style={{ marginLeft: 12 }} />
              </View>
            </Pressable>
          );
        })}
      </View>
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

  const handleCall = useCallback(async (phone: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await makeCallNative(phone);
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

  const handleCall = useCallback(async () => {
    if (!number) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await makeCallNative(number);
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

  const handleCallVoicemail = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await makeCallNative('*86');
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

export function PhoneScreen({ navigation }: { navigation: any }) { // eslint-disable-line @typescript-eslint/no-explicit-any
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
      case 1: return <RecentsTab />;
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
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            style={styles.navBackButton}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.systemBlue} />
          </Pressable>
          <Text style={[typography.headline, { color: colors.label }]}>Phone</Text>
          {/* Right slot keeps title centered */}
          <View style={styles.navBackButton} />
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
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  navBackButton: {
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
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
    minHeight: 44,
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
    fontWeight: '600',
    lineHeight: 34,
  },
  keypadLetters: {
    fontSize: 10,
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
