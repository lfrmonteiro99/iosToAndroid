import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
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
import { BlurView } from 'expo-blur';
import { useApps, InstalledApp } from '../store/AppsStore';
import { useTheme } from '../theme/ThemeContext';

const SCREEN_WIDTH = Dimensions.get('window').width;

const BUILT_IN_APPS: Record<string, string> = {
  'com.iostoandroid.phone': 'Phone',
  'com.iostoandroid.messages': 'Messages',
  'com.iostoandroid.contacts': 'Contacts',
  'com.iostoandroid.settings': 'Settings',
};

// ─── App Icon ────────────────────────────────────────────────────────────────

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

// ─── Siri Suggestions ────────────────────────────────────────────────────────

function SiriSuggestions({
  apps,
  onLaunch,
  colors,
}: {
  apps: InstalledApp[];
  onLaunch: (app: InstalledApp) => void;
  colors: any;
}) {
  // Show up to 8 recent/suggested apps
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

// ─── Main Screen ─────────────────────────────────────────────────────────────

export function SpotlightSearchScreen({ navigation }: { navigation: any }) {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { apps, launchApp } = useApps();
  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    // Auto-focus the search bar on mount
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const filteredApps = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return apps.filter(
      (app) =>
        app.name.toLowerCase().includes(q) ||
        app.packageName.toLowerCase().includes(q),
    );
  }, [apps, query]);

  const handleLaunch = useCallback(
    (app: InstalledApp) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const route = BUILT_IN_APPS[app.packageName];
      if (route) {
        navigation.navigate(route);
      } else {
        launchApp(app.packageName);
      }
    },
    [navigation, launchApp],
  );

  const handleCancel = useCallback(() => {
    Keyboard.dismiss();
    navigation.goBack();
  }, [navigation]);

  const showSuggestions = query.trim().length === 0;
  const showResults = query.trim().length > 0;

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
        <SiriSuggestions
          apps={apps}
          onLaunch={handleLaunch}
          colors={colors}
        />
      )}

      {showResults && filteredApps.length > 0 && (
        <FlatList
          data={filteredApps}
          keyExtractor={(item) => item.packageName}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20 }}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => handleLaunch(item)}
              style={({ pressed }) => [
                styles.resultRow,
                {
                  backgroundColor: pressed
                    ? 'rgba(255,255,255,0.1)'
                    : 'rgba(255,255,255,0.06)',
                },
                index === 0 && { borderTopLeftRadius: 12, borderTopRightRadius: 12 },
                index === filteredApps.length - 1 && { borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
              ]}
            >
              <AppIcon app={item} size={42} />
              <View style={styles.resultInfo}>
                <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.resultSubtitle} numberOfLines={1}>App</Text>
              </View>
            </Pressable>
          )}
          ItemSeparatorComponent={() => (
            <View style={[styles.resultSeparator, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.1)', marginLeft: 62 }} />
            </View>
          )}
        />
      )}

      {showResults && filteredApps.length === 0 && (
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

// ─── Styles ──────────────────────────────────────────────────────────────────

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
