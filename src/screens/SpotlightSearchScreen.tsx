/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  SectionList,
  Pressable,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useApps, InstalledApp } from '../store/AppsStore';
import { useDevice, DeviceContact } from '../store/DeviceStore';
import { useContacts, Contact } from '../store/ContactsStore';
import { useTheme } from '../theme/ThemeContext';
import { CupertinoSearchBar } from '../components/CupertinoSearchBar';
import type { AppNavigationProp, RootStackParamList } from '../navigation/types';

// ---------------------------------------------------------------------------
// Fuzzy matching
// ---------------------------------------------------------------------------

function fuzzyMatch(text: string, query: string): { match: boolean; score: number } {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  // Exact match = score 3
  if (lowerText === lowerQuery) return { match: true, score: 3 };
  // Starts with = score 2
  if (lowerText.startsWith(lowerQuery)) return { match: true, score: 2 };
  // Contains = score 1
  if (lowerText.includes(lowerQuery)) return { match: true, score: 1 };
  // Character-by-character fuzzy (all query chars appear in order) = score 0.5
  let qi = 0;
  for (let i = 0; i < lowerText.length && qi < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[qi]) qi++;
  }
  if (qi === lowerQuery.length) return { match: true, score: 0.5 };
  return { match: false, score: 0 };
}

// ---------------------------------------------------------------------------
// Settings search index
// ---------------------------------------------------------------------------

const SETTINGS_INDEX: { name: string; screen: keyof RootStackParamList; keywords: string[] }[] = [
  { name: 'Wi-Fi', screen: 'WiFi', keywords: ['wifi', 'internet', 'network', 'wireless'] },
  { name: 'Bluetooth', screen: 'Bluetooth', keywords: ['bluetooth', 'pair', 'connect'] },
  { name: 'Display & Brightness', screen: 'DisplayBrightness', keywords: ['brightness', 'display', 'screen', 'dark mode'] },
  { name: 'Sounds & Haptics', screen: 'SoundsHaptics', keywords: ['sounds', 'volume', 'ringtone', 'vibration'] },
  { name: 'Battery', screen: 'Battery', keywords: ['battery', 'power', 'charging'] },
  { name: 'Privacy & Security', screen: 'Privacy', keywords: ['privacy', 'security', 'permissions'] },
  { name: 'General', screen: 'General', keywords: ['general', 'about', 'software update'] },
  { name: 'Accessibility', screen: 'Accessibility', keywords: ['accessibility', 'voiceover', 'zoom'] },
  { name: 'Wallpaper', screen: 'Wallpaper', keywords: ['wallpaper', 'background'] },
  { name: 'Notifications', screen: 'Notifications', keywords: ['notifications', 'alerts', 'badges'] },
];

// ---------------------------------------------------------------------------
// Search history helpers
// ---------------------------------------------------------------------------

const HISTORY_KEY = 'spotlight_search_history';
const MAX_HISTORY = 10;

async function loadHistory(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveHistory(history: string[]): Promise<void> {
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

async function addToHistory(query: string, current: string[]): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return current;
  const filtered = current.filter((h) => h !== trimmed);
  const updated = [trimmed, ...filtered].slice(0, MAX_HISTORY);
  await saveHistory(updated);
  return updated;
}

async function clearHistory(): Promise<string[]> {
  await AsyncStorage.removeItem(HISTORY_KEY);
  return [];
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const NOTES_STORAGE_KEY = '@iostoandroid/notes';
const MAIL_STORAGE_KEY = '@iostoandroid/mail_inbox';
const REMINDERS_STORAGE_KEY = '@iostoandroid/reminders';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

interface AppResult {
  type: 'app';
  app: InstalledApp;
  score: number;
}

interface ContactResult {
  type: 'contact';
  contact: DeviceContact | Contact;
  contactId: string;
  name: string;
  phone: string;
  score: number;
}

interface SettingResult {
  type: 'setting';
  name: string;
  screen: keyof RootStackParamList;
  score: number;
}

interface WebSearchResult {
  type: 'webSearch';
  query: string;
}

interface NoteResult {
  type: 'note';
  title: string;
  id: string;
}

interface MailResult {
  type: 'mail';
  id: string;
  subject: string;
  sender: string;
}

interface ReminderResult {
  type: 'reminder';
  id: string;
  title: string;
}

type SearchResult = AppResult | ContactResult | SettingResult | WebSearchResult | NoteResult | MailResult | ReminderResult;

// ---------------------------------------------------------------------------
// App Icon (reused pattern from AppLibraryScreen)
// ---------------------------------------------------------------------------

const ICON_SIZE = 40;
const ICON_RADIUS = 10;

function AppIcon({ app, size = ICON_SIZE }: { app: InstalledApp; size?: number }) {
  const radius = (size / ICON_SIZE) * ICON_RADIUS;
  if (app.icon) {
    return (
      <Image
        source={{ uri: `data:image/png;base64,${app.icon}` }}
        style={{ width: size, height: size, borderRadius: radius }}
        resizeMode="cover"
      />
    );
  }
  const letter = app.name.charAt(0).toUpperCase();
  const hue = app.name.charCodeAt(0) % 360;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: `hsl(${hue}, 55%, 55%)`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: size * 0.4, fontWeight: '600' }}>
        {letter}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export function SpotlightSearchScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, isDark } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { apps, launchApp } = useApps();
  const { contacts: deviceContacts } = useDevice();
  const { contacts: storeContacts } = useContacts();

  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [notes, setNotes] = useState<Array<{ id: string; title: string }>>([]);
  const [mails, setMails] = useState<Array<{ id: string; subject: string; sender: string }>>([]);
  const [reminders, setReminders] = useState<Array<{ id: string; title: string }>>([]);
  const historyLoaded = useRef(false);

  // Load history on mount
  useEffect(() => {
    if (!historyLoaded.current) {
      historyLoaded.current = true;
      loadHistory().then(setHistory);
    }
  }, []);

  // Load notes, mail, and reminders on mount
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(NOTES_STORAGE_KEY),
      AsyncStorage.getItem(MAIL_STORAGE_KEY),
      AsyncStorage.getItem(REMINDERS_STORAGE_KEY),
    ]).then(([notesRaw, mailRaw, remindersRaw]) => {
      if (notesRaw) {
        try {
          const parsed = JSON.parse(notesRaw);
          if (Array.isArray(parsed)) {
            setNotes(parsed.map((n: any) => ({ id: n.id ?? String(n.title), title: n.title ?? '' })));
          }
        } catch { /* ignore */ }
      }
      if (mailRaw) {
        try {
          const parsed = JSON.parse(mailRaw);
          if (Array.isArray(parsed)) {
            setMails(parsed.map((m: any) => ({ id: m.id ?? '', subject: m.subject ?? '', sender: m.sender ?? '' })));
          }
        } catch { /* ignore */ }
      }
      if (remindersRaw) {
        try {
          const parsed = JSON.parse(remindersRaw);
          if (Array.isArray(parsed)) {
            setReminders(parsed.filter((r: any) => !r.completed).map((r: any) => ({ id: r.id ?? '', title: r.title ?? '' })));
          }
        } catch { /* ignore */ }
      }
    });
  }, []);

  // Merge contacts: device contacts + store contacts (deduplicate by id)
  const allContacts = useMemo(() => {
    const map = new Map<string, DeviceContact | Contact>();
    for (const c of deviceContacts) {
      map.set(c.id, c);
    }
    for (const c of storeContacts) {
      if (!map.has(c.id)) {
        map.set(c.id, c);
      }
    }
    return Array.from(map.values());
  }, [deviceContacts, storeContacts]);

  // Search across all categories
  const sections = useMemo(() => {
    const q = query.trim();
    if (!q) return [];

    // Web Search (always shown when searching)
    const webSearchResults: WebSearchResult[] = [{ type: 'webSearch', query: q }];

    // Apps
    const appResults: AppResult[] = [];
    for (const app of apps) {
      const nameMatch = fuzzyMatch(app.name, q);
      const pkgMatch = fuzzyMatch(app.packageName, q);
      const bestScore = Math.max(nameMatch.score, pkgMatch.score);
      if (nameMatch.match || pkgMatch.match) {
        appResults.push({ type: 'app', app, score: bestScore });
      }
    }
    appResults.sort((a, b) => b.score - a.score);

    // Contacts
    const contactResults: ContactResult[] = [];
    for (const contact of allContacts) {
      const fullName = `${contact.firstName} ${contact.lastName}`.trim();
      const result = fuzzyMatch(fullName, q);
      if (result.match) {
        contactResults.push({
          type: 'contact',
          contact,
          contactId: contact.id,
          name: fullName,
          phone: contact.phone || '',
          score: result.score,
        });
      }
    }
    contactResults.sort((a, b) => b.score - a.score);

    // Notes
    const noteResults: NoteResult[] = notes
      .filter((n) => fuzzyMatch(n.title, q).match)
      .map((n) => ({ type: 'note' as const, title: n.title, id: n.id }));

    // Mail
    const mailResults: MailResult[] = mails
      .filter((m) => fuzzyMatch(m.subject, q).match || fuzzyMatch(m.sender, q).match)
      .map((m) => ({ type: 'mail' as const, id: m.id, subject: m.subject, sender: m.sender }));

    // Reminders
    const reminderResults: ReminderResult[] = reminders
      .filter((r) => fuzzyMatch(r.title, q).match)
      .map((r) => ({ type: 'reminder' as const, id: r.id, title: r.title }));

    // Settings
    const settingResults: SettingResult[] = [];
    for (const setting of SETTINGS_INDEX) {
      const nameMatch = fuzzyMatch(setting.name, q);
      let bestScore = nameMatch.score;
      let matched = nameMatch.match;
      for (const kw of setting.keywords) {
        const kwMatch = fuzzyMatch(kw, q);
        if (kwMatch.match && kwMatch.score > bestScore) {
          bestScore = kwMatch.score;
          matched = true;
        }
      }
      if (matched) {
        settingResults.push({ type: 'setting', name: setting.name, screen: setting.screen, score: bestScore });
      }
    }
    settingResults.sort((a, b) => b.score - a.score);

    const result: { title: string; data: SearchResult[] }[] = [];
    result.push({ title: 'Web', data: webSearchResults });
    if (appResults.length > 0) result.push({ title: 'Apps', data: appResults });
    if (contactResults.length > 0) result.push({ title: 'Contacts', data: contactResults });
    if (mailResults.length > 0) result.push({ title: 'Mail', data: mailResults });
    if (noteResults.length > 0) result.push({ title: 'Notes', data: noteResults });
    if (reminderResults.length > 0) result.push({ title: 'Reminders', data: reminderResults });
    if (settingResults.length > 0) result.push({ title: 'Settings', data: settingResults });
    return result;
  }, [query, apps, allContacts, notes, mails, reminders]);

  const handleResultPress = useCallback(async (item: SearchResult) => {
    const updatedHistory = await addToHistory(query, history);
    setHistory(updatedHistory);

    switch (item.type) {
      case 'app':
        launchApp(item.app.packageName);
        break;
      case 'contact':
        navigation.navigate('ContactDetail', { contactId: item.contactId });
        break;
      case 'setting':
        navigation.navigate(item.screen as never);
        break;
      case 'webSearch':
        // Navigate to browser or open external URL in future; for now no-op
        break;
      case 'note':
        navigation.navigate('Notes');
        break;
      case 'mail':
        navigation.navigate('Mail');
        break;
      case 'reminder':
        navigation.navigate('Reminders');
        break;
    }
  }, [query, history, launchApp, navigation]);

  const handleHistoryPress = useCallback((historyQuery: string) => {
    setQuery(historyQuery);
  }, []);

  const handleClearHistory = useCallback(async () => {
    const cleared = await clearHistory();
    setHistory(cleared);
  }, []);

  const isSearching = query.trim().length > 0;
  const showHistory = isFocused && !isSearching && history.length > 0;

  const renderItem = useCallback(({ item }: { item: SearchResult }) => {
    switch (item.type) {
      case 'webSearch':
        return (
          <Pressable
            onPress={() => handleResultPress(item)}
            style={({ pressed }) => [styles.resultRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.systemBlue }]}>
              <Ionicons name="globe-outline" size={24} color="#fff" />
            </View>
            <View style={styles.resultTextWrap}>
              <Text style={[styles.resultTitle, { color: colors.label }]}>
                Search Web for &ldquo;{item.query}&rdquo;
              </Text>
            </View>
          </Pressable>
        );
      case 'app':
        return (
          <Pressable
            onPress={() => handleResultPress(item)}
            style={({ pressed }) => [styles.resultRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <AppIcon app={item.app} size={40} />
            <View style={styles.resultTextWrap}>
              <Text style={[styles.resultTitle, { color: colors.label }]}>{item.app.name}</Text>
            </View>
          </Pressable>
        );
      case 'contact':
        return (
          <Pressable
            onPress={() => handleResultPress(item)}
            style={({ pressed }) => [styles.resultRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.systemGray4 }]}>
              <Ionicons name="person-circle" size={36} color={colors.systemGray} />
            </View>
            <View style={styles.resultTextWrap}>
              <Text style={[styles.resultTitle, { color: colors.label }]}>{item.name}</Text>
              {item.phone ? (
                <Text style={[styles.resultSubtitle, { color: colors.secondaryLabel }]}>{item.phone}</Text>
              ) : null}
            </View>
          </Pressable>
        );
      case 'note':
        return (
          <Pressable
            onPress={() => handleResultPress(item)}
            style={({ pressed }) => [styles.resultRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#FFD60A' }]}>
              <Ionicons name="document-text" size={22} color="#000" />
            </View>
            <View style={styles.resultTextWrap}>
              <Text style={[styles.resultTitle, { color: colors.label }]}>{item.title}</Text>
              <Text style={[styles.resultSubtitle, { color: colors.secondaryLabel }]}>Notes</Text>
            </View>
          </Pressable>
        );
      case 'mail':
        return (
          <Pressable
            onPress={() => handleResultPress(item)}
            style={({ pressed }) => [styles.resultRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#007AFF' }]}>
              <Ionicons name="mail" size={22} color="#fff" />
            </View>
            <View style={styles.resultTextWrap}>
              <Text style={[styles.resultTitle, { color: colors.label }]} numberOfLines={1}>{item.subject}</Text>
              <Text style={[styles.resultSubtitle, { color: colors.secondaryLabel }]}>Mail · {item.sender}</Text>
            </View>
          </Pressable>
        );
      case 'reminder':
        return (
          <Pressable
            onPress={() => handleResultPress(item)}
            style={({ pressed }) => [styles.resultRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#FF9500' }]}>
              <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
            </View>
            <View style={styles.resultTextWrap}>
              <Text style={[styles.resultTitle, { color: colors.label }]} numberOfLines={1}>{item.title}</Text>
              <Text style={[styles.resultSubtitle, { color: colors.secondaryLabel }]}>Reminders</Text>
            </View>
          </Pressable>
        );
      case 'setting':
        return (
          <Pressable
            onPress={() => handleResultPress(item)}
            style={({ pressed }) => [styles.resultRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.systemGray4 }]}>
              <Ionicons name="settings" size={24} color={colors.systemGray} />
            </View>
            <View style={styles.resultTextWrap}>
              <Text style={[styles.resultTitle, { color: colors.label }]}>{item.name}</Text>
              <Text style={[styles.resultSubtitle, { color: colors.secondaryLabel }]}>
                Settings &gt; {item.name}
              </Text>
            </View>
          </Pressable>
        );
      default:
        return null;
    }
  }, [colors, handleResultPress]);

  const renderSectionHeader = useCallback(({ section }: { section: { title: string } }) => (
    <View style={[styles.sectionHeader, { backgroundColor: colors.systemGroupedBackground }]}>
      <Text style={[styles.sectionHeaderText, { color: colors.secondaryLabel }]}>
        {section.title}
      </Text>
    </View>
  ), [colors]);

  return (
    <View style={[styles.root, { backgroundColor: colors.systemGroupedBackground }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Navigation bar */}
      <View style={[styles.navBar, { paddingTop: insets.top + 8, borderBottomColor: colors.separator }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.systemBlue} />
          <Text style={[styles.backLabel, { color: colors.systemBlue }]}>Back</Text>
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.label }]}>Search</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Search bar */}
      <View style={styles.searchBarWrap}>
        <CupertinoSearchBar
          value={query}
          onChangeText={setQuery}
          onFocusChange={setIsFocused}
          placeholder="Search"
          autoFocus
        />
      </View>

      {showHistory ? (
        /* Search history */
        <View style={styles.historyContainer}>
          <View style={styles.historyHeader}>
            <Text style={[styles.historyTitle, { color: colors.label }]}>Recent Searches</Text>
            <Pressable onPress={handleClearHistory}>
              <Text style={[styles.historyClear, { color: colors.systemBlue }]}>Clear</Text>
            </Pressable>
          </View>
          {history.map((item, index) => (
            <Pressable
              key={`${item}-${index}`}
              onPress={() => handleHistoryPress(item)}
              style={({ pressed }) => [
                styles.historyRow,
                {
                  opacity: pressed ? 0.7 : 1,
                  borderBottomColor: colors.separator,
                  borderBottomWidth: index < history.length - 1 ? StyleSheet.hairlineWidth : 0,
                },
              ]}
            >
              <Ionicons name="time-outline" size={18} color={colors.secondaryLabel} />
              <Text style={[styles.historyText, { color: colors.label }]}>{item}</Text>
            </Pressable>
          ))}
        </View>
      ) : isSearching ? (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => {
            if (item.type === 'app') return `app-${item.app.packageName}`;
            if (item.type === 'contact') return `contact-${item.contactId}`;
            if (item.type === 'setting') return `setting-${item.screen}`;
            if (item.type === 'webSearch') return `web-${item.query}`;
            if (item.type === 'note') return `note-${item.id}`;
            if (item.type === 'mail') return `mail-${item.id}`;
            if (item.type === 'reminder') return `reminder-${item.id}`;
            return `item-${index}`;
          }}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          ItemSeparatorComponent={() => (
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 66 }} />
          )}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.secondaryLabel }]}>No Results</Text>
            </View>
          }
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 70,
    paddingHorizontal: 4,
  },
  backLabel: {
    fontSize: 17,
    fontWeight: '400',
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  searchBarWrap: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  // Section header
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    paddingTop: 12,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Result row
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 12,
  },
  resultTextWrap: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '400',
  },
  resultSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 2,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // History
  historyContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  historyClear: {
    fontSize: 16,
    fontWeight: '400',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  historyText: {
    fontSize: 16,
    fontWeight: '400',
  },
  // Empty
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '500',
  },
});
