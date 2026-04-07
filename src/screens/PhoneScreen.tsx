import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import type { CallLogEntry } from '../../modules/launcher-module/src';
import { useDevice, DeviceContact } from '../store/DeviceStore';
import { useTheme } from '../theme/ThemeContext';
import { CupertinoActivityIndicator } from '../components';

const getLauncher = async () => {
  try {
    return (await import('../../modules/launcher-module/src')).default;
  } catch {
    return null;
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
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759',
  '#5AC8FA', '#007AFF', '#5856D6', '#AF52DE',
  '#FF2D55', '#30B0C7',
];

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const KEYPAD_ROWS = [
  [{ digit: '1', letters: '' }, { digit: '2', letters: 'ABC' }, { digit: '3', letters: 'DEF' }],
  [{ digit: '4', letters: 'GHI' }, { digit: '5', letters: 'JKL' }, { digit: '6', letters: 'MNO' }],
  [{ digit: '7', letters: 'PQRS' }, { digit: '8', letters: 'TUV' }, { digit: '9', letters: 'WXYZ' }],
  [{ digit: '*', letters: '' }, { digit: '0', letters: '+' }, { digit: '#', letters: '' }],
];

const TAB_CONFIG = [
  { key: 'recents', label: 'Recents', icon: 'time' as const, iconOutline: 'time-outline' as const },
  { key: 'contacts', label: 'Contacts', icon: 'person-circle' as const, iconOutline: 'person-circle-outline' as const },
  { key: 'keypad', label: 'Keypad', icon: 'keypad' as const, iconOutline: 'keypad-outline' as const },
];

// ─── Avatar ─────────────────────────────────────────────────────────────────

function ContactAvatar({ contact, size = 40 }: { contact: DeviceContact; size?: number }) {
  const initials = getInitials(contact);
  const bg = avatarColor(contact.id);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

// ─── Recents Tab ────────────────────────────────────────────────────────────

function RecentsTab({ contacts, onCall, onInfo, colors, typography }: {
  contacts: DeviceContact[];
  onCall: (phone: string, name?: string) => void;
  onInfo: (phone: string, name?: string) => void;
  colors: any;
  typography: any;
}) {
  const [callLog, setCallLog] = useState<CallLogEntry[]>([]);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const mod = await getLauncher();
      if (mod) {
        try {
          const log = await mod.getCallLog(50);
          setCallLog(log);
        } catch {
          setPermissionDenied(true);
        }
      }
      setLoading(false);
    })();
  }, []);

  const findContact = useCallback((phone: string) => {
    const digits = phone.replace(/\D/g, '').slice(-9);
    return contacts.find((c) => c.phone.replace(/\D/g, '').slice(-9) === digits);
  }, [contacts]);

  if (loading) {
    return (
      <View style={styles.emptyState}>
        <CupertinoActivityIndicator />
      </View>
    );
  }

  if (permissionDenied) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="time-outline" size={48} color={colors.systemGray3} />
        <Text style={[typography.title3, { color: colors.label, marginTop: 12 }]}>Call Log Unavailable</Text>
        <Text style={[typography.subhead, { color: colors.secondaryLabel, marginTop: 6, textAlign: 'center' }]}>
          Allow access to see recent calls.
        </Text>
        <TouchableOpacity
          style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: colors.systemBlue, borderRadius: 12 }}
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
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 15 }}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (callLog.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="time-outline" size={48} color={colors.systemGray3} />
        <Text style={[typography.title3, { color: colors.label, marginTop: 12 }]}>No Recent Calls</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={callLog}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingBottom: 100 }}
      renderItem={({ item, index }) => {
        const isMissed = item.type === 'missed' || item.type === 'rejected';
        const contact = item.name && item.name !== item.number
          ? findContact(item.number)
          : undefined;
        const displayName = item.name && item.name !== item.number ? item.name : item.number;
        const isLast = index === callLog.length - 1;

        return (
          <Pressable
            onPress={() => onCall(item.number, displayName)}
            style={({ pressed }) => [
              styles.recentRow,
              { backgroundColor: pressed ? colors.systemGray5 : 'transparent' },
            ]}
          >
            <View style={styles.recentLeft}>
              {/* Call direction icon */}
              <View style={{ width: 28, alignItems: 'center', marginRight: 8 }}>
                {item.type === 'outgoing' ? (
                  <Ionicons name="arrow-up" size={16} color={colors.systemGreen} />
                ) : item.type === 'incoming' ? (
                  <Ionicons name="arrow-down" size={16} color={colors.systemGreen} />
                ) : (
                  <Ionicons name="close" size={16} color={colors.systemRed} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    typography.body,
                    {
                      color: isMissed ? colors.systemRed : colors.label,
                      fontWeight: '400',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {displayName}
                </Text>
                <Text style={[typography.caption1, { color: colors.secondaryLabel, marginTop: 1 }]}>
                  {item.type === 'outgoing' ? 'Outgoing' : item.type === 'incoming' ? 'Incoming' : item.type === 'missed' ? 'Missed' : 'Cancelled'}
                </Text>
              </View>
            </View>
            <View style={styles.recentRight}>
              <Text style={[typography.subhead, { color: colors.secondaryLabel }]}>
                {item.dateFormatted}
              </Text>
              <TouchableOpacity
                onPress={() => onInfo(item.number, displayName)}
                style={{ marginLeft: 12, padding: 4 }}
                hitSlop={8}
              >
                <Ionicons name="information-circle-outline" size={22} color={colors.systemBlue} />
              </TouchableOpacity>
            </View>
            {!isLast && (
              <View style={[styles.rowSeparator, { backgroundColor: colors.separator, left: 52 }]} />
            )}
          </Pressable>
        );
      }}
    />
  );
}

// ─── Contacts Tab ───────────────────────────────────────────────────────────

interface Section {
  title: string;
  data: DeviceContact[];
}

function ContactsTab({ contacts, onCall, colors, typography }: {
  contacts: DeviceContact[];
  onCall: (phone: string, name?: string) => void;
  colors: any;
  typography: any;
}) {
  const sections = useMemo(() => {
    const sorted = [...contacts].sort((a, b) =>
      getFullName(a).localeCompare(getFullName(b)),
    );
    const map: Record<string, DeviceContact[]> = {};
    for (const c of sorted) {
      const letter = getFullName(c)[0]?.toUpperCase() || '#';
      const key = /[A-Z]/.test(letter) ? letter : '#';
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    return Object.entries(map)
      .sort(([a], [b]) => a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b))
      .map(([title, data]) => ({ title, data }));
  }, [contacts]);

  const sectionIndex = useMemo(() => sections.map(s => s.title), [sections]);

  if (contacts.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="person-outline" size={48} color={colors.systemGray3} />
        <Text style={[typography.title3, { color: colors.label, marginTop: 12 }]}>No Contacts</Text>
        <Text style={[typography.subhead, { color: colors.secondaryLabel, marginTop: 6, textAlign: 'center', paddingHorizontal: 32 }]}>
          Grant permission in Settings to see contacts.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: colors.systemGroupedBackground }]}>
            <Text style={[typography.headline, { color: colors.label, fontSize: 15 }]}>
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const isLast = index === section.data.length - 1;
          return (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onCall(item.phone, getFullName(item));
              }}
              style={({ pressed }) => [
                styles.contactRow,
                { backgroundColor: pressed ? colors.systemGray5 : colors.secondarySystemGroupedBackground },
              ]}
            >
              <ContactAvatar contact={item} size={40} />
              <View style={[
                styles.contactInfo,
                !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
              ]}>
                <Text style={[typography.body, { color: colors.label }]} numberOfLines={1}>
                  {getFullName(item)}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
      {/* Section index on the right side (like iOS) */}
      <View style={styles.sectionIndexContainer}>
        {sectionIndex.map((letter) => (
          <Text key={letter} style={[styles.sectionIndexLetter, { color: colors.systemBlue }]}>
            {letter}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ─── Keypad Tab ─────────────────────────────────────────────────────────────

function KeypadTab({ onCall, colors, typography, isDark }: {
  onCall: (phone: string, name?: string) => void;
  colors: any;
  typography: any;
  isDark: boolean;
}) {
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
    onCall(number);
  }, [number, onCall]);

  const keyBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)';

  return (
    <View style={[styles.keypadContainer, { paddingBottom: insets.bottom + 80 }]}>
      {/* Number display */}
      <View style={styles.keypadDisplay}>
        <Text
          style={[
            styles.keypadNumber,
            { color: colors.label },
            number.length > 12 && { fontSize: 28 },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {number || '\u00A0'}
        </Text>
      </View>

      {/* Add Number link */}
      {number.length > 0 && (
        <TouchableOpacity style={{ marginBottom: 16 }}>
          <Text style={{ color: colors.systemBlue, fontSize: 15 }}>Add Number</Text>
        </TouchableOpacity>
      )}

      {/* Keypad grid */}
      <View style={styles.keypadGrid}>
        {KEYPAD_ROWS.map((row, ri) => (
          <View key={ri} style={styles.keypadRow}>
            {row.map(({ digit, letters }) => (
              <TouchableOpacity
                key={digit}
                onPress={() => handleDigit(digit)}
                activeOpacity={0.6}
                style={[styles.keypadKey, { backgroundColor: keyBg }]}
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

      {/* Action row: spacer, call button, delete */}
      <View style={styles.keypadActions}>
        <View style={styles.keypadActionSlot} />
        <TouchableOpacity
          onPress={handleCall}
          style={[
            styles.keypadCallButton,
            { backgroundColor: colors.systemGreen },
          ]}
          activeOpacity={0.7}
        >
          <Ionicons name="call" size={32} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.keypadActionSlot}>
          {number.length > 0 && (
            <TouchableOpacity
              onPress={handleDelete}
              onLongPress={() => setNumber('')}
              style={styles.keypadBackspace}
            >
              <Ionicons name="backspace-outline" size={28} color={colors.label} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── PhoneScreen ─────────────────────────────────────────────────────────────

export function PhoneScreen({ navigation }: { navigation: any }) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const device = useDevice();
  const [selectedTab, setSelectedTab] = useState(0);

  const handleCall = useCallback((phone: string, name?: string) => {
    navigation.navigate('CallScreen', { number: phone, name });
  }, [navigation]);

  const handleInfo = useCallback((_phone: string, _name?: string) => {
    // Could navigate to contact detail in the future
  }, []);

  const renderContent = () => {
    switch (selectedTab) {
      case 0:
        return (
          <RecentsTab
            contacts={device.contacts}
            onCall={handleCall}
            onInfo={handleInfo}
            colors={colors}
            typography={typography}
          />
        );
      case 1:
        return (
          <ContactsTab
            contacts={device.contacts}
            onCall={handleCall}
            colors={colors}
            typography={typography}
          />
        );
      case 2:
        return (
          <KeypadTab
            onCall={handleCall}
            colors={colors}
            typography={typography}
            isDark={theme.dark}
          />
        );
      default:
        return null;
    }
  };

  const tabTitle = TAB_CONFIG[selectedTab].label;

  return (
    <View style={[styles.screen, { backgroundColor: colors.systemGroupedBackground }]}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />

      {/* iOS-style header with large title */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerTopRow}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={28} color={colors.systemBlue} />
          </Pressable>
          {selectedTab === 0 && (
            <TouchableOpacity style={{ padding: 4 }}>
              <Text style={{ color: colors.systemBlue, fontSize: 17 }}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={[styles.largeTitle, { color: colors.label }]}>
          {tabTitle}
        </Text>
      </View>

      {/* Content area */}
      <View style={styles.content}>
        {renderContent()}
      </View>

      {/* iOS-style bottom tab bar */}
      <BlurView
        intensity={90}
        tint={theme.dark ? 'dark' : 'light'}
        experimentalBlurMethod="dimezisBlurView"
        style={[
          styles.tabBar,
          {
            paddingBottom: insets.bottom,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.separator,
          },
        ]}
      >
        <View style={styles.tabBarRow}>
          {TAB_CONFIG.map((tab, index) => {
            const isActive = selectedTab === index;
            const iconName = isActive ? tab.icon : tab.iconOutline;
            const color = isActive ? colors.systemBlue : colors.systemGray;
            return (
              <Pressable
                key={tab.key}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedTab(index);
                }}
                style={styles.tabItem}
              >
                <Ionicons name={iconName} size={25} color={color} />
                <Text style={[styles.tabLabel, { color }]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get('window').width;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -8,
  },
  largeTitle: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.41,
    marginBottom: 4,
  },
  content: {
    flex: 1,
  },

  // Tab bar
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  tabBarRow: {
    flexDirection: 'row',
    height: 49,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  // Recents
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    minHeight: 56,
    position: 'relative',
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
  rowSeparator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },

  // Contacts
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    minHeight: 52,
  },
  contactInfo: {
    flex: 1,
    paddingRight: 16,
    paddingVertical: 10,
    marginLeft: 12,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    paddingTop: 8,
  },
  sectionIndexContainer: {
    position: 'absolute',
    right: 2,
    top: 0,
    bottom: 100,
    justifyContent: 'center',
    alignItems: 'center',
    width: 16,
    paddingVertical: 8,
  },
  sectionIndexLetter: {
    fontSize: 11,
    fontWeight: '600',
    paddingVertical: 0.5,
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
    fontSize: 36,
    fontWeight: '300',
    letterSpacing: 2,
    textAlign: 'center',
    flex: 1,
  },
  keypadGrid: {
    width: '100%',
    maxWidth: 310,
    marginBottom: 16,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  keypadKey: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadDigit: {
    fontSize: 32,
    fontWeight: '300',
    lineHeight: 38,
  },
  keypadLetters: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.8,
    marginTop: -2,
    opacity: 0.7,
  },
  keypadActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 310,
    marginBottom: 8,
  },
  keypadActionSlot: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadCallButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadBackspace: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
