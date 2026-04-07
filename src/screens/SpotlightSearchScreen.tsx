import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  SectionList,
  Pressable,
  StyleSheet,
  TextInput,
  Keyboard,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApps, InstalledApp } from '../store/AppsStore';
import { useDevice, DeviceContact } from '../store/DeviceStore';
import { useTheme } from '../theme/ThemeContext';

const SCREEN_WIDTH = Dimensions.get('window').width;
const HISTORY_KEY = '@spotlight_history';
const MAX_HISTORY = 5;

const BUILT_IN_APPS: Record<string, string> = {
  'com.iostoandroid.phone': 'Phone',
  'com.iostoandroid.messages': 'Messages',
  'com.iostoandroid.contacts': 'Contacts',
  'com.iostoandroid.settings': 'Settings',
};

// ─── Fuzzy scoring ──────────────────────────────────────────────────────────

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 50;

  // Character-by-character fuzzy: all chars present in order
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  if (qi === q.length) return 20;

  return 0;
}

// ─── Search result types ────────────────────────────────────────────────────

interface AppResult {
  type: 'app';
  id: string;
  name: string;
  score: number;
  app: InstalledApp;
}

interface ContactResult {
  type: 'contact';
  id: string;
  name: string;
  score: number;
  contact: DeviceContact;
}

type SearchResult = AppResult | ContactResult;

// ─── History helpers ────────────────────────────────────────────────────────

async function loadHistory(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveToHistory(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return await loadHistory();
  try {
    const prev = await loadHistory();
    const filtered = prev.filter((h) => h !== trimmed);
    const next = [trimmed, ...filtered].slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

async function clearHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
}

// ─── App Icon ───────────────────────────────────────────────────────────────

function AppIcon({ app, size = 46 }: { app: InstalledApp; size?: number }) {
  const radius = size * 0.22;
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
      <Text style={{ color: '#fff', fontSize: size * 0.4, fontWeight: '600' }}>{letter}</Text>
    </View>
  );
}

// ─── Contact Icon ───────────────────────────────────────────────────────────

function ContactIcon({ contact, size = 42 }: { contact: DeviceContact; size?: number }) {
  if (contact.imageUri) {
    return (
      <Image
        source={{ uri: contact.imageUri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="cover"
      />
    );
  }
  const initials = `${(contact.firstName || '')[0] || ''}${(contact.lastName || '')[0] || ''}`.toUpperCase() || '?';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#8E8E93',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="person" size={size * 0.5} color="#fff" />
    </View>
  );
}

// ─── Siri Suggestions ───────────────────────────────────────────────────────

function SiriSuggestions({
  apps,
  onLaunch,
  colors,
}: {
  apps: InstalledApp[];
  onLaunch: (app: InstalledApp) => void;
  colors: any;
}) {
  const suggested = apps.slice(0, 8);
  const iconSize = 54;

  return (
    <View style={styles.suggestionsSection}>
      <Text style={[styles.sectionTitle, { color: colors.secondaryLabel }]}>
        SIRI SUGGESTIONS
      </Text>
      <View style={[styles.suggestionsCard, { backgroundColor: colors.secondarySystemGroupedBackground }]}>
        <View style={styles.suggestionsGrid}>
          {suggested.map((app) => (
            <Pressable
              key={app.packageName}
              style={styles.suggestionItem}
              onPress={() => onLaunch(app)}
            >
              <AppIcon app={app} size={iconSize} />
              <Text style={[styles.suggestionLabel, { color: colors.label }]} numberOfLines={1}>
                {app.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Recent Searches ────────────────────────────────────────────────────────

function RecentSearches({
  history,
  onSelect,
  onClear,
}: {
  history: string[];
  onSelect: (query: string) => void;
  onClear: () => void;
}) {
  if (history.length === 0) return null;

  return (
    <View style={styles.historySection}>
      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>RECENT</Text>
        <Pressable onPress={onClear} hitSlop={8}>
          <Text style={styles.historyClear}>Clear</Text>
        </Pressable>
      </View>
      {history.map((item, index) => (
        <Pressable
          key={`${item}-${index}`}
          style={styles.historyRow}
          onPress={() => onSelect(item)}
        >
          <Ionicons name="time-outline" size={18} color="rgba(255,255,255,0.5)" style={{ marginRight: 12 }} />
          <Text style={styles.historyText} numberOfLines={1}>{item}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export function SpotlightSearchScreen({ navigation }: { navigation: any }) {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { apps, launchApp } = useApps();
  const { contacts } = useDevice();
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    loadHistory().then(setHistory);
  }, []);

  const sections = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim();

    // Score apps
    const appResults: AppResult[] = [];
    for (const app of apps) {
      const nameScore = fuzzyScore(q, app.name);
      const pkgScore = fuzzyScore(q, app.packageName);
      const score = Math.max(nameScore, pkgScore);
      if (score > 0) {
        appResults.push({ type: 'app', id: app.packageName, name: app.name, score, app });
      }
    }
    appResults.sort((a, b) => b.score - a.score);

    // Score contacts
    const contactResults: ContactResult[] = [];
    for (const c of contacts) {
      const fullName = `${c.firstName} ${c.lastName}`.trim();
      const score = fuzzyScore(q, fullName);
      if (score > 0) {
        contactResults.push({ type: 'contact', id: c.id, name: fullName, score, contact: c });
      }
    }
    contactResults.sort((a, b) => b.score - a.score);

    const result: { title: string; data: SearchResult[] }[] = [];
    if (appResults.length > 0) result.push({ title: 'Apps', data: appResults });
    if (contactResults.length > 0) result.push({ title: 'Contacts', data: contactResults });
    return result;
  }, [apps, contacts, query]);

  const totalResults = sections.reduce((sum, s) => sum + s.data.length, 0);

  const persistSearch = useCallback(async (q: string) => {
    const next = await saveToHistory(q);
    setHistory(next);
  }, []);

  const handleLaunch = useCallback(
    (app: InstalledApp) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (query.trim()) persistSearch(query.trim());
      const route = BUILT_IN_APPS[app.packageName];
      if (route) {
        navigation.navigate(route);
      } else {
        launchApp(app.packageName);
      }
    },
    [navigation, launchApp, query, persistSearch],
  );

  const handleContactPress = useCallback(
    (contact: DeviceContact) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (query.trim()) persistSearch(query.trim());
      navigation.navigate('ContactDetail', { contactId: contact.id });
    },
    [navigation, query, persistSearch],
  );

  const handleSubmit = useCallback(() => {
    if (query.trim()) persistSearch(query.trim());
  }, [query, persistSearch]);

  const handleCancel = useCallback(() => {
    Keyboard.dismiss();
    navigation.goBack();
  }, [navigation]);

  const handleHistorySelect = useCallback((q: string) => {
    setQuery(q);
  }, []);

  const handleClearHistory = useCallback(async () => {
    await clearHistory();
    setHistory([]);
  }, []);

  const showSuggestions = query.trim().length === 0;
  const showResults = query.trim().length > 0;

  const renderItem = useCallback(({ item, index, section }: { item: SearchResult; index: number; section: { data: SearchResult[] } }) => {
    const isFirst = index === 0;
    const isLast = index === section.data.length - 1;

    if (item.type === 'contact') {
      return (
        <Pressable
          onPress={() => handleContactPress(item.contact)}
          style={({ pressed }) => [
            styles.resultRow,
            {
              backgroundColor: pressed
                ? 'rgba(255,255,255,0.1)'
                : 'rgba(255,255,255,0.06)',
            },
            isFirst && { borderTopLeftRadius: 12, borderTopRightRadius: 12 },
            isLast && { borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
          ]}
        >
          <ContactIcon contact={item.contact} size={42} />
          <View style={styles.resultInfo}>
            <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.resultSubtitle} numberOfLines={1}>Contact</Text>
          </View>
        </Pressable>
      );
    }

    return (
      <Pressable
        onPress={() => handleLaunch(item.app)}
        style={({ pressed }) => [
          styles.resultRow,
          {
            backgroundColor: pressed
              ? 'rgba(255,255,255,0.1)'
              : 'rgba(255,255,255,0.06)',
          },
          isFirst && { borderTopLeftRadius: 12, borderTopRightRadius: 12 },
          isLast && { borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
        ]}
      >
        <AppIcon app={item.app} size={42} />
        <View style={styles.resultInfo}>
          <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.resultSubtitle} numberOfLines={1}>App</Text>
        </View>
      </Pressable>
    );
  }, [handleLaunch, handleContactPress]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.dark ? 'rgba(0,0,0,0.92)' : 'rgba(0,0,0,0.85)' }]}>
      <StatusBar style="light" />

      {/* Search bar area */}
      <View style={[styles.searchArea, { paddingTop: insets.top + 8 }]}>
        <View style={styles.searchBarRow}>
          <View style={[styles.searchBar, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.2)' }]}>
            <Ionicons name="search" size={18} color="rgba(255,255,255,0.6)" style={{ marginRight: 8 }} />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Search"
              placeholderTextColor="rgba(255,255,255,0.45)"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleSubmit}
              selectionColor="rgba(255,255,255,0.5)"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.5)" />
              </Pressable>
            )}
          </View>
          <Pressable onPress={handleCancel} hitSlop={8} style={{ marginLeft: 12 }}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>

      {/* Content */}
      {showSuggestions && (
        <>
          <RecentSearches
            history={history}
            onSelect={handleHistorySelect}
            onClear={handleClearHistory}
          />
          <SiriSuggestions
            apps={apps}
            onLaunch={handleLaunch}
            colors={colors}
          />
        </>
      )}

      {showResults && totalResults > 0 && (
        <SectionList
          sections={sections}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20 }}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={renderItem}
          SectionSeparatorComponent={() => <View style={{ height: 12 }} />}
          ItemSeparatorComponent={() => (
            <View style={[styles.resultSeparator, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.1)', marginLeft: 62 }} />
            </View>
          )}
        />
      )}

      {showResults && totalResults === 0 && (
        <View style={styles.noResults}>
          <Text style={styles.noResultsText}>No Results</Text>
          <Text style={styles.noResultsSubtext}>No results found for &ldquo;{query}&rdquo;</Text>
        </View>
      )}

      {/* Tap outside to dismiss */}
      {showSuggestions && (
        <Pressable
          style={styles.dismissArea}
          onPress={handleCancel}
        />
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  searchArea: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    color: '#FFFFFF',
    paddingVertical: 0,
  },
  cancelText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 17,
  },

  // Siri Suggestions
  suggestionsSection: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 4,
  },
  suggestionsCard: {
    borderRadius: 14,
    padding: 12,
    paddingBottom: 4,
  },
  suggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  suggestionItem: {
    width: (SCREEN_WIDTH - 32 - 24) / 4,
    alignItems: 'center',
    marginBottom: 12,
  },
  suggestionLabel: {
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
    width: '90%',
  },

  // Section headers
  sectionHeader: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginLeft: 4,
    marginTop: 4,
  },

  // Results
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  resultInfo: {
    flex: 1,
    marginLeft: 14,
  },
  resultName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '400',
  },
  resultSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 1,
  },
  resultSeparator: {
    paddingHorizontal: 14,
  },

  // History
  historySection: {
    paddingHorizontal: 16,
    marginTop: 12,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginLeft: 4,
    marginRight: 4,
  },
  historyTitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  historyClear: {
    color: '#007AFF',
    fontSize: 15,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  historyText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    flex: 1,
  },

  // No results
  noResults: {
    alignItems: 'center',
    marginTop: 60,
  },
  noResultsText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 22,
    fontWeight: '600',
  },
  noResultsSubtext: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 15,
    marginTop: 6,
  },

  // Dismiss
  dismissArea: {
    flex: 1,
  },
});
