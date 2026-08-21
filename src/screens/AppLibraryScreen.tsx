import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useApps, InstalledApp } from '../store/AppsStore';
import { useTheme } from '../theme/ThemeContext';
import { CupertinoSearchBar } from '../components/CupertinoSearchBar';
import { CupertinoNavigationBar, CupertinoEmptyState } from '../components';
import type { AppNavigationProp } from '../navigation/types';
import type { CupertinoColors } from '../theme/CupertinoTheme';
import { hapticImpact } from '../utils/haptics';

// ---------------------------------------------------------------------------
// Category detection
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: { name: string; keywords: string[] }[] = [
  {
    name: 'Social',
    keywords: ['facebook', 'instagram', 'twitter', 'whatsapp', 'telegram', 'messenger', 'tiktok', 'snapchat', 'linkedin', 'reddit', 'discord'],
  },
  {
    name: 'Entertainment',
    keywords: ['youtube', 'netflix', 'spotify', 'disney', 'twitch', 'gaming', 'game', 'prime', 'hbo', 'hulu', 'music', 'podcast', 'radio', 'player'],
  },
  {
    name: 'Productivity',
    keywords: ['gmail', 'drive', 'docs', 'sheets', 'calendar', 'slack', 'teams', 'office', 'word', 'excel', 'outlook', 'notion', 'trello', 'asana', 'zoom', 'meet'],
  },
  {
    name: 'Utilities',
    keywords: ['calculator', 'clock', 'camera', 'files', 'settings', 'weather', 'maps', 'compass', 'flashlight', 'scanner', 'notes', 'reminder', 'translate', 'browser', 'chrome', 'firefox'],
  },
  {
    name: 'Shopping',
    keywords: ['amazon', 'ebay', 'aliexpress', 'wish', 'shop', 'store', 'market', 'etsy', 'shein', 'zalando'],
  },
];

function categorizeApp(app: InstalledApp): string {
  const nameLower = app.name.toLowerCase();
  const pkgLower = app.packageName.toLowerCase();
  for (const cat of CATEGORY_KEYWORDS) {
    for (const kw of cat.keywords) {
      if (nameLower.includes(kw) || pkgLower.includes(kw)) {
        return cat.name;
      }
    }
  }
  return 'Other';
}

// ---------------------------------------------------------------------------
// App Icon component
// ---------------------------------------------------------------------------

const ICON_SIZE = 50;
const ICON_RADIUS = 12;

const AppIcon = React.memo(function AppIcon({ app, size = ICON_SIZE }: { app: InstalledApp; size?: number }) {
  const radius = (size / ICON_SIZE) * ICON_RADIUS;
  if (app.icon) {
    return (
      <Image
        source={{ uri: app.icon }}
        style={{ width: size, height: size, borderRadius: radius }}
        resizeMode="cover"
      />
    );
  }
  // Fallback letter icon
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
});

// ---------------------------------------------------------------------------
// Category Card
// ---------------------------------------------------------------------------

interface CategoryCardProps {
  title: string;
  apps: InstalledApp[];
  onPress: () => void;
  onLaunchApp: (packageName: string) => void;
  cardWidth: number;
}

// From this many apps onward, the 4th grid cell becomes a 2x2 "more apps"
// quadrant instead of a 4th large icon. Below this, 3 large icons + a
// quadrant holding a single mini icon reads worse than just 4 equal large
// icons — there's nothing extra to signal, so the quadrant only appears once
// there truly is more content hiding behind it.
const QUADRANT_MIN_APPS = 5;
const MAX_QUADRANT_MINIS = 4;
const MINI_GAP = 3;
const MIN_TOUCH_TARGET = 44;

// Pads small icon cells up to the platform's minimum touch target (§1.5)
// without inflating their visual size.
function touchHitSlop(size: number) {
  const pad = Math.ceil(Math.max(0, MIN_TOUCH_TARGET - size) / 2);
  return { top: pad, bottom: pad, left: pad, right: pad };
}

export const CategoryCard = React.memo(function CategoryCard({ title, apps, onPress, onLaunchApp, cardWidth }: CategoryCardProps) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const iconSize = (cardWidth - 24 - 6) / 2; // 2 columns with gap inside padding
  const iconHitSlop = touchHitSlop(iconSize);
  const miniSize = (iconSize - MINI_GAP) / 2;

  const hasQuadrant = apps.length >= QUADRANT_MIN_APPS;
  const largeApps = hasQuadrant ? apps.slice(0, 3) : apps.slice(0, 4);
  const miniApps = hasQuadrant ? apps.slice(3, 3 + MAX_QUADRANT_MINIS) : [];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.categoryCard,
        {
          width: cardWidth,
          backgroundColor: colors.secondarySystemGroupedBackground,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
      accessibilityLabel={`${title} category, ${apps.length} app${apps.length !== 1 ? 's' : ''}`}
      accessibilityRole="button"
    >
      {/* 3 large icons (each opens its app directly) plus, once there are
          more apps than fit, a mini-icon quadrant that opens the category */}
      <View style={styles.iconGrid}>
        {largeApps.map((a) => (
          <Pressable
            key={a.packageName}
            onPress={() => onLaunchApp(a.packageName)}
            hitSlop={iconHitSlop}
            style={{ width: iconSize, height: iconSize }}
            accessibilityLabel={`Open ${a.name}, App Library`}
            accessibilityRole="button"
          >
            <AppIcon app={a} size={iconSize} />
          </Pressable>
        ))}
        {hasQuadrant && (
          <Pressable
            onPress={onPress}
            hitSlop={iconHitSlop}
            style={[styles.miniQuadrant, { width: iconSize, height: iconSize }]}
            accessibilityLabel={`See all ${apps.length} apps in ${title}`}
            accessibilityRole="button"
          >
            {miniApps.map((a) => (
              <View key={a.packageName} style={{ width: miniSize, height: miniSize }}>
                <AppIcon app={a} size={miniSize} />
              </View>
            ))}
          </Pressable>
        )}
      </View>
      <Text
        style={[typography.subhead, styles.categoryTitle, { color: colors.label }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <Text style={[typography.caption1, styles.categoryCount, { color: colors.secondaryLabel }]}>
        {apps.length} app{apps.length !== 1 ? 's' : ''}
      </Text>
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// Category Detail Modal
// ---------------------------------------------------------------------------

interface CategoryDetailProps {
  visible: boolean;
  title: string;
  apps: InstalledApp[];
  onClose: () => void;
  onLaunch: (pkg: string) => void;
}

function CategoryDetailModal({ visible, title, apps, onClose, onLaunch }: CategoryDetailProps) {
  const { theme, isDark, typography, textScale } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const numCols = 4;
  const cellW = width / numCols;
  const iconSize = cellW * 0.58;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.modalRoot, { backgroundColor: colors.systemGroupedBackground }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        {/* Header */}
        <View style={[styles.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.separator }]}>
          <Text style={[styles.modalTitle, { color: colors.label, fontSize: 18 * textScale }]}>{title}</Text>
          <Pressable onPress={onClose} style={styles.modalCloseBtn} accessibilityLabel="Close">
            <Ionicons name="close-circle" size={28} color={colors.systemGray2} />
          </Pressable>
        </View>
        {/* Grid */}
        <FlatList
          data={apps}
          numColumns={numCols}
          keyExtractor={(item) => item.packageName}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 16 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => { onLaunch(item.packageName); onClose(); }}
              style={[styles.modalAppCell, { width: cellW }]}
              accessibilityLabel={`Open ${item.name}, App Library`}
              accessibilityRole="button"
            >
              <AppIcon app={item} size={iconSize} />
              <Text style={[typography.caption2, styles.modalAppLabel, { color: colors.label }]} numberOfLines={2}>
                {item.name}
              </Text>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Horizontal app strip (Recently Added / Suggestions)
// ---------------------------------------------------------------------------

const AppStrip = React.memo(function AppStrip({
  apps,
  onLaunch,
}: {
  apps: InstalledApp[];
  onLaunch: (pkg: string) => void;
}) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const stripIconSize = 62;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripContent}>
      {apps.map((app) => (
        <Pressable
          key={app.packageName}
          onPress={() => onLaunch(app.packageName)}
          style={styles.stripItem}
          accessibilityLabel={`Open ${app.name}, App Library`}
          accessibilityRole="button"
        >
          <AppIcon app={app} size={stripIconSize} />
          <Text style={[typography.caption2, styles.stripLabel, { color: colors.label }]} numberOfLines={2}>
            {app.name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
});

// ---------------------------------------------------------------------------
// Search results list
// ---------------------------------------------------------------------------

const SearchResults = React.memo(function SearchResults({
  apps,
  onLaunch,
}: {
  apps: InstalledApp[];
  onLaunch: (pkg: string) => void;
}) {
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  return (
    <FlatList
      data={apps}
      keyExtractor={(item) => item.packageName}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
      ItemSeparatorComponent={() => (
        <View style={{ height: 1, backgroundColor: colors.separator, marginLeft: 66 }} />
      )}
      ListEmptyComponent={
        <CupertinoEmptyState
          icon="search-outline"
          title="No Results"
          message="No apps match your search."
        />
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onLaunch(item.packageName)}
          style={({ pressed }) => [styles.searchRow, { opacity: pressed ? 0.7 : 1 }]}
          accessibilityLabel={`Open ${item.name}, App Library`}
          accessibilityRole="button"
        >
          <AppIcon app={item} size={46} />
          <Text style={[typography.callout, styles.searchRowLabel, { color: colors.label }]}>{item.name}</Text>
        </Pressable>
      )}
    />
  );
});

// ---------------------------------------------------------------------------
// Section Header helper
// ---------------------------------------------------------------------------

function SectionHeader({ title, colors }: { title: string; colors: CupertinoColors }) {
  const { typography } = useTheme();
  return (
    <Text style={[typography.title3, styles.sectionHeader, { color: colors.label }]}>{title}</Text>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

// Shared body of the App Library: search bar, Recently Added / Suggestions
// strips, category grid and the category detail modal. Rendered both by the
// `AppLibrary` stack route (AppLibraryScreen, below) and directly as the last
// page of the paginated home screen (LauncherHomeScreen) — see issue #434.
// Keeping this in one place means the two call sites can't drift apart the
// way twin overlays did in #384.
export function AppLibraryContent() {
  const { theme } = useTheme();
  const { colors } = theme;
  const { apps, launchApp, recentApps } = useApps();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [query, setQuery] = useState('');
  const [categoryModal, setCategoryModal] = useState<{ title: string; apps: InstalledApp[] } | null>(null);

  // Card layout — 2 columns with gap
  const CARD_GAP = 12;
  const SIDE_PAD = 16;
  const cardWidth = (width - SIDE_PAD * 2 - CARD_GAP) / 2;

  // Categorise all apps
  const categories = useMemo(() => {
    const map: Record<string, InstalledApp[]> = {};
    for (const app of apps) {
      const cat = categorizeApp(app);
      if (!map[cat]) map[cat] = [];
      map[cat].push(app);
    }
    // Sort categories — Other last
    const keys = Object.keys(map).sort((a, b) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return a.localeCompare(b);
    });
    return keys.map((name) => ({ name, apps: map[name] }));
  }, [apps]);

  // Recently Added — most recently launched apps (by launchedAt timestamp)
  const recentlyAddedApps = useMemo(() => {
    const recentPkgs = [...recentApps]
      .sort((a, b) => b.launchedAt - a.launchedAt)
      .slice(0, 4)
      .map(r => apps.find(a => a.packageName === r.packageName))
      .filter((a): a is InstalledApp => !!a);
    if (recentPkgs.length > 0) return recentPkgs;
    // Fallback: newest-named apps when no launch history exists
    return [...apps].sort((a, b) => b.name.localeCompare(a.name)).slice(0, 4);
  }, [apps, recentApps]);

  // Suggestions — next 4 most-recently-launched apps after Recently Added
  const suggestedApps = useMemo(() => {
    const recentSorted = [...recentApps]
      .sort((a, b) => b.launchedAt - a.launchedAt)
      .slice(4, 8)
      .map(r => apps.find(a => a.packageName === r.packageName))
      .filter((a): a is InstalledApp => !!a);
    if (recentSorted.length > 0) return recentSorted;
    return [...apps].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 4);
  }, [apps, recentApps]);

  // Filtered apps for search
  const filteredApps = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return apps
      .filter((a) => a.name.toLowerCase().includes(q) || a.packageName.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [apps, query]);

  const handleLaunch = useCallback((packageName: string) => {
    hapticImpact(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    launchApp(packageName);
  }, [launchApp]);

  const isSearching = query.trim().length > 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.systemGroupedBackground }]}>
      {/* Search bar */}
      <View style={styles.searchBarWrap}>
        <CupertinoSearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="App Library"
          autoFocus={false}
        />
      </View>

      {isSearching ? (
        /* Search results */
        <SearchResults apps={filteredApps} onLaunch={handleLaunch} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Recently Added */}
          {recentlyAddedApps.length > 0 && (
            <View style={styles.stripSection}>
              <SectionHeader title="Recently Added" colors={colors} />
              <View style={[styles.stripCard, { backgroundColor: colors.secondarySystemGroupedBackground }]}>
                <AppStrip apps={recentlyAddedApps} onLaunch={handleLaunch} />
              </View>
            </View>
          )}

          {/* Suggestions */}
          {suggestedApps.length > 0 && (
            <View style={styles.stripSection}>
              <SectionHeader title="Suggestions" colors={colors} />
              <View style={[styles.stripCard, { backgroundColor: colors.secondarySystemGroupedBackground }]}>
                <AppStrip apps={suggestedApps} onLaunch={handleLaunch} />
              </View>
            </View>
          )}

          {/* Category grid */}
          <SectionHeader title="Categories" colors={colors} />
          <View style={styles.categoryGrid}>
            {categories.map((cat) => (
              <CategoryCard
                key={cat.name}
                title={cat.name}
                apps={cat.apps}
                cardWidth={cardWidth}
                onPress={() => setCategoryModal({ title: cat.name, apps: cat.apps })}
                onLaunchApp={handleLaunch}
              />
            ))}
          </View>
        </ScrollView>
      )}

      {/* Category Detail Modal */}
      {categoryModal && (
        <CategoryDetailModal
          visible
          title={categoryModal.title}
          apps={categoryModal.apps}
          onClose={() => setCategoryModal(null)}
          onLaunch={handleLaunch}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stack route wrapper — nav bar + back button, then the shared content
// ---------------------------------------------------------------------------

export function AppLibraryScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, isDark, typography } = useTheme();
  const { colors } = theme;

  return (
    <View style={styles.screenRoot}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <CupertinoNavigationBar
        title="App Library"
        largeTitle={false}
        leftButton={
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.systemBlue} />
            <Text style={[typography.body, styles.backLabel, { color: colors.systemBlue }]}>Back</Text>
          </Pressable>
        }
        rightButton={
          <Pressable
            onPress={() => navigation.navigate('AppStore')}
            style={styles.storeBtn}
            accessibilityRole="button"
            accessibilityLabel="App Store"
          >
            <Ionicons name="bag-outline" size={22} color={colors.systemBlue} />
          </Pressable>
        }
      />
      <AppLibraryContent />
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
  screenRoot: {
    flex: 1,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 70,
    paddingHorizontal: 4,
  },
  backLabel: {
    fontWeight: '400',
  },
  storeBtn: {
    minWidth: 70,
    alignItems: 'flex-end',
    paddingHorizontal: 4,
  },
  searchBarWrap: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  sectionHeader: {
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 10,
    marginTop: 8,
  },

  // Strip section (Recently Added / Suggestions)
  stripSection: {
    marginBottom: 16,
  },
  stripCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  stripContent: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 18,
  },
  stripItem: {
    alignItems: 'center',
    width: 72,
  },
  stripLabel: {
    fontWeight: '400',
    marginTop: 5,
    textAlign: 'center',
  },

  // Category grid
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  categoryCard: {
    borderRadius: 20,
    padding: 12,
    overflow: 'hidden',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    marginBottom: 10,
  },
  miniQuadrant: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'center',
    justifyContent: 'center',
    gap: MINI_GAP,
  },
  categoryTitle: {
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  categoryCount: {
    fontWeight: '400',
    marginTop: 2,
  },

  // Search results
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  searchRowLabel: {
    fontWeight: '400',
  },

  // Modal
  modalRoot: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontWeight: '700',
    letterSpacing: -0.3,
    flex: 1,
    textAlign: 'center',
  },
  modalCloseBtn: {
    position: 'absolute',
    right: 16,
    bottom: 10,
  },
  modalAppCell: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  modalAppLabel: {
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 5,
  },
});
