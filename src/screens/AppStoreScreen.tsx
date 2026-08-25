import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  StatusBar,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CupertinoNavigationBar, CupertinoSegmentedControl, CupertinoSearchBar } from '../components';
import { useTheme } from '../theme/ThemeContext';
import { useApps, VIRTUAL_APP_PACKAGE_NAMES } from '../store/AppsStore';
import { CURATED_APPS, type CuratedApp } from '../data/curatedApps';
import type { AppNavigationProp } from '../navigation/types';
import { logger } from '../utils/logger';
import type { InstalledApp } from '../store/AppsStore';
import { launchBuiltInOrExternal } from '../utils/launchBuiltIn';

// Segment labels live in one place — inserting/reordering a tab means
// changing this array only, not the render branches below.
const APP_STORE_SEGMENTS = ['Today', 'Search', 'Categories', 'Updates'] as const;

// ---------------------------------------------------------------------------
// Categories tab — keyword-based grouping, scoped to this file
// ---------------------------------------------------------------------------

// Same keyword-matching approach as AppLibraryScreen's own categorizer, kept
// as an independent copy (deliberately not imported) because this screen's
// catalog is CURATED_APPS + installed apps, not just installed apps — see
// issue #252. Curated entries already carry a real `category`; this list
// only classifies installed apps that aren't in CURATED_APPS.
const INSTALLED_CATEGORY_KEYWORDS: { name: string; keywords: string[] }[] = [
  {
    name: 'Social Networking',
    keywords: ['facebook', 'instagram', 'twitter', 'whatsapp', 'telegram', 'messenger', 'tiktok', 'snapchat', 'linkedin', 'reddit', 'discord'],
  },
  {
    name: 'Entertainment',
    keywords: ['youtube', 'netflix', 'disney', 'twitch', 'game', 'prime', 'hbo', 'hulu', 'podcast', 'radio', 'player'],
  },
  {
    name: 'Music',
    keywords: ['spotify', 'music', 'soundcloud'],
  },
  {
    name: 'Productivity',
    keywords: ['gmail', 'drive', 'docs', 'sheets', 'calendar', 'slack', 'teams', 'office', 'word', 'excel', 'outlook', 'notion', 'trello', 'asana', 'zoom', 'meet', 'todoist'],
  },
  {
    name: 'Photo & Video',
    keywords: ['camera', 'photo', 'gallery', 'video', 'vsco', 'lightroom'],
  },
  {
    name: 'Utilities',
    keywords: ['calculator', 'clock', 'files', 'settings', 'weather', 'maps', 'compass', 'flashlight', 'scanner', 'notes', 'reminder', 'translate', 'browser', 'chrome', 'firefox'],
  },
  {
    name: 'Education',
    keywords: ['duolingo', 'learn', 'course', 'school', 'study'],
  },
];

function categorizeInstalledApp(app: InstalledApp): string {
  const nameLower = app.name.toLowerCase();
  const pkgLower = app.packageName.toLowerCase();
  for (const cat of INSTALLED_CATEGORY_KEYWORDS) {
    for (const kw of cat.keywords) {
      if (nameLower.includes(kw) || pkgLower.includes(kw)) {
        return cat.name;
      }
    }
  }
  return 'Other';
}

/** Play Store deep link for a single app listing. */
export function playStoreUrl(packageName: string): string {
  return `market://details?id=${packageName}`;
}

/** Web fallback used when no Play Store client can handle `market://`. */
export function playStoreWebUrl(packageName: string): string {
  return `https://play.google.com/store/apps/details?id=${packageName}`;
}

/** Play Store's own search UI for a query — not an in-app result list. */
export function playStoreSearchUrl(query: string): string {
  return `market://search?q=${encodeURIComponent(query)}`;
}

/** Web fallback for the Play Store search deep link. */
export function playStoreSearchWebUrl(query: string): string {
  return `https://play.google.com/store/search?q=${encodeURIComponent(query)}&c=apps`;
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function AppRow({
  app,
  installed,
  onOpen,
  onGet,
  onPressCard,
}: {
  app: CuratedApp;
  installed: boolean;
  onOpen: (packageName: string) => void;
  onGet: (packageName: string) => void;
  onPressCard: (app: CuratedApp) => void;
}) {
  const { theme, typography, borderRadius } = useTheme();
  const { colors } = theme;

  return (
    <Pressable
      onPress={() => onPressCard(app)}
      accessibilityRole="button"
      style={[
        styles.card,
        {
          backgroundColor: colors.secondarySystemGroupedBackground,
          borderRadius: borderRadius.medium,
        },
      ]}
      accessibilityLabel={`${app.name} card`}
    >
      <View style={[styles.iconPlaceholder, { backgroundColor: colors.systemGray5 }]}>
        <Ionicons name="cube-outline" size={26} color={colors.secondaryLabel} />
      </View>

      <View style={styles.cardText}>
        <Text style={[typography.headline, { color: colors.label }]} numberOfLines={1}>
          {app.name}
        </Text>
        <Text style={[typography.footnote, { color: colors.secondaryLabel }]} numberOfLines={2}>
          {app.tagline}
        </Text>
        <Text style={[typography.caption1, { color: colors.tertiaryLabel }]} numberOfLines={1}>
          {app.category}
        </Text>
      </View>

      <Pressable
        onPress={() => (installed ? onOpen(app.packageName) : onGet(app.packageName))}
        accessibilityRole="button"
        accessibilityLabel={`${installed ? 'Open' : 'Get'} ${app.name}`}
        style={[styles.actionBtn, { backgroundColor: colors.systemGray5 }]}
      >
        <Text style={[typography.footnote, styles.actionLabel, { color: colors.systemBlue }]}>
          {installed ? 'Open' : 'Get'}
        </Text>
      </Pressable>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Updates tab — honest manual-update check (no fabrication of update state)
// ---------------------------------------------------------------------------

// Android offers no public, key-free way for a third-party app to know whether
// an installed app has an update pending — that needs the Play Developer API,
// which this app neither has nor can obtain. So the Updates tab does NOT claim
// to detect updates. It lists every real, user-installed app (system apps and
// this app's own virtual built-ins excluded) and offers a deep link to that
// app's Play Store page so the user can check/update manually. No fabricated
// "N updates available" badge, no fake version comparison, ever.
function UpdatesTab({ apps, onCheck }: { apps: InstalledApp[]; onCheck: (packageName: string) => void }) {
  const { theme, typography } = useTheme();
  const { colors } = theme;

  return (
    <>
      <Text
        testID="updates-notice"
        style={[typography.footnote, styles.updatesNotice, { color: colors.secondaryLabel }]}
      >
        Android cannot check for app updates automatically. Tap an app to open its Play Store page.
      </Text>

      {apps.length === 0 ? (
        <Text style={[typography.footnote, styles.updatesEmpty, { color: colors.tertiaryLabel }]}>
          No installed apps to check.
        </Text>
      ) : (
        apps.map((app) => (
          <Pressable
            key={app.packageName}
            onPress={() => onCheck(app.packageName)}
            accessibilityRole="button"
            accessibilityLabel={`Check ${app.name} on Play Store`}
            style={[
              styles.updateRow,
              { backgroundColor: colors.secondarySystemGroupedBackground },
            ]}
          >
            <View style={[styles.iconPlaceholder, { backgroundColor: colors.systemGray5 }]}>
              <Ionicons name="cube-outline" size={26} color={colors.secondaryLabel} />
            </View>
            <View style={styles.cardText}>
              <Text style={[typography.headline, { color: colors.label }]} numberOfLines={1}>
                {app.name}
              </Text>
              <Text style={[typography.caption1, { color: colors.tertiaryLabel }]} numberOfLines={1}>
                {app.packageName}
              </Text>
            </View>
            <Text style={[typography.footnote, styles.updateActionLabel, { color: colors.systemBlue }]}>
              Check
            </Text>
          </Pressable>
        ))
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function AppStoreScreen({ navigation }: { navigation: AppNavigationProp }) {
  // O cartao abre o detalhe (#246). A rota so existe se estiver registada no
  // TabNavigator E for navegada de algum sitio — este repo ja teve rotas
  // registadas que ninguem alcancava.
  const openDetail = React.useCallback(
    (app: CuratedApp) =>
      navigation.navigate('AppStoreDetail', { packageName: app.packageName, name: app.name }),
    [navigation],
  );
  const { theme, isDark, typography } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { apps, launchApp } = useApps();
  const [tabIndex, setTabIndex] = useState(0);
  const [query, setQuery] = useState('');

  // Set of installed package names — lookup is by packageName only, never by
  // display name, so a user-renamed app still resolves as installed.
  const installedPackages = useMemo(
    () => new Set(apps.map((a) => a.packageName)),
    [apps],
  );

  // Updates tab candidates: real, user-installed apps only. System apps are
  // excluded via isSystem; this app's own virtual built-ins (Phone, Messages,
  // Settings, …) are excluded by package name because every entry in
  // VIRTUAL_APPS_MAP has isSystem:false and would otherwise slip through.
  const updatableCandidates = useMemo(
    () =>
      apps.filter(
        (a) => !a.isSystem && !VIRTUAL_APP_PACKAGE_NAMES.has(a.packageName),
      ),
    [apps],
  );

  // Built-in virtual apps (Clock, Calculator, …) surfaced here via the
  // installed-apps search match must open the in-app iOS-style screen, not be
  // handed to the native launcher bridge — see launchBuiltInOrExternal (#706).
  const handleOpen = useCallback(
    (packageName: string) => {
      launchBuiltInOrExternal(packageName, navigation, launchApp);
    },
    [navigation, launchApp],
  );

  // Guarded the same way CupertinoShareSheet guards its Linking calls: probe
  // canOpenURL first, and fall back to the https listing when no Play Store
  // client is installed (common on de-Googled devices and on emulators).
  const handleGet = useCallback(async (packageName: string) => {
    const marketUrl = playStoreUrl(packageName);
    try {
      if (await Linking.canOpenURL(marketUrl)) {
        await Linking.openURL(marketUrl);
        return;
      }
      const webUrl = playStoreWebUrl(packageName);
      if (await Linking.canOpenURL(webUrl)) {
        await Linking.openURL(webUrl);
      }
    } catch (err) {
      logger.warn('AppStoreScreen', 'could not open store listing', err);
    }
  }, []);

  const handleSearchOnPlayStore = useCallback(async (searchQuery: string) => {
    const marketUrl = playStoreSearchUrl(searchQuery);
    try {
      if (await Linking.canOpenURL(marketUrl)) {
        await Linking.openURL(marketUrl);
        return;
      }
      const webUrl = playStoreSearchWebUrl(searchQuery);
      if (await Linking.canOpenURL(webUrl)) {
        await Linking.openURL(webUrl);
      }
    } catch (err) {
      logger.warn('AppStoreScreen', 'could not open Play Store search', err);
    }
  }, []);

  // Manual update check: Android can't tell us whether an installed app has a
  // pending update, so we deep-link to its Play Store listing and let the user
  // check there. Same canOpenURL→openURL→https-fallback guard as the Today
  // "Get" action — honest about the limitation, not faking detection.
  const handleCheckUpdate = useCallback(async (packageName: string) => {
    const marketUrl = playStoreUrl(packageName);
    try {
      if (await Linking.canOpenURL(marketUrl)) {
        await Linking.openURL(marketUrl);
        return;
      }
      const webUrl = playStoreWebUrl(packageName);
      if (await Linking.canOpenURL(webUrl)) {
        await Linking.openURL(webUrl);
      }
    } catch (err) {
      logger.warn('AppStoreScreen', 'could not open store listing', err);
    }
  }, []);

  // Installed apps and CURATED_APPS are two different catalogs — neither one
  // is a public "search" API (Android has none usable without Play Developer
  // API credentials this app doesn't have), so this only ever matches against
  // what's already known locally. Merged by packageName; `installed` is
  // always recomputed against the live installedPackages set so an app that's
  // actually on the device still shows as Open even if it only matched via
  // its CURATED_APPS name.
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const byPackage = new Map<string, CuratedApp & { installed: boolean }>();
    const addResult = (packageName: string, name: string, category: string, tagline: string) => {
      if (byPackage.has(packageName)) return;
      byPackage.set(packageName, {
        packageName,
        name,
        category,
        tagline,
        installed: installedPackages.has(packageName),
      });
    };

    for (const app of apps) {
      if (app.name.toLowerCase().includes(q) || app.packageName.toLowerCase().includes(q)) {
        const curated = CURATED_APPS.find((c) => c.packageName === app.packageName);
        addResult(app.packageName, app.name, curated?.category ?? 'Installed', curated?.tagline ?? '');
      }
    }
    for (const curated of CURATED_APPS) {
      if (curated.name.toLowerCase().includes(q)) {
        addResult(curated.packageName, curated.name, curated.category, curated.tagline);
      }
    }

    return Array.from(byPackage.values());
  }, [apps, query, installedPackages]);

  // Grouped by category for the Categories tab: every CURATED_APPS entry
  // under its declared category, plus installed apps not already in
  // CURATED_APPS grouped by a local keyword match (categorizeInstalledApp).
  // 'Other' always sorts last, same convention as AppLibraryScreen.
  const categorySections = useMemo(() => {
    const map: Record<string, CuratedApp[]> = {};
    const curatedPackages = new Set(CURATED_APPS.map((c) => c.packageName));

    for (const curated of CURATED_APPS) {
      (map[curated.category] ??= []).push(curated);
    }

    for (const app of apps) {
      if (curatedPackages.has(app.packageName)) continue;
      const category = categorizeInstalledApp(app);
      (map[category] ??= []).push({
        packageName: app.packageName,
        name: app.name,
        category,
        tagline: '',
      });
    }

    return Object.keys(map)
      .sort((a, b) => {
        if (a === 'Other') return 1;
        if (b === 'Other') return -1;
        return a.localeCompare(b);
      })
      .map((name) => ({ name, items: map[name] }));
  }, [apps]);

  return (
    <View style={styles.screenRoot}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <CupertinoNavigationBar
        title="App Store"
        largeTitle={false}
        leftButton={
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.systemBlue} />
            <Text style={[typography.body, styles.backLabel, { color: colors.systemBlue }]}>
              Back
            </Text>
          </Pressable>
        }
      />

      <View style={styles.segmentedWrap}>
        <CupertinoSegmentedControl
          values={[...APP_STORE_SEGMENTS]}
          selectedIndex={tabIndex}
          onChange={setTabIndex}
        />
      </View>

      <ScrollView
        style={[styles.root, { backgroundColor: colors.systemGroupedBackground }]}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {tabIndex === 0 ? (
          <>
            <Text style={[typography.title1, styles.sectionTitle, { color: colors.label }]}>Today</Text>
            <Text style={[typography.footnote, styles.sectionNote, { color: colors.secondaryLabel }]}>
              A hand-picked selection — not live Play Store data.
            </Text>

            {CURATED_APPS.map((app) => (
              <AppRow
                onPressCard={openDetail}
                key={app.packageName}
                app={app}
                installed={installedPackages.has(app.packageName)}
                onOpen={handleOpen}
                onGet={handleGet}
              />
            ))}
          </>
        ) : tabIndex === 1 ? (
          <>
            <CupertinoSearchBar value={query} onChangeText={setQuery} placeholder="Search Apps" />
            <Text
              testID="app-store-search-disclaimer"
              style={[typography.footnote, styles.sectionNote, { color: colors.secondaryLabel }]}
            >
              Searches installed apps and the curated catalog only — not live Play Store results.
            </Text>

            {searchResults.map((app) => (
              <AppRow
                onPressCard={openDetail}
                key={app.packageName}
                app={app}
                installed={app.installed}
                onOpen={handleOpen}
                onGet={handleGet}
              />
            ))}

            <Pressable
              onPress={() => handleSearchOnPlayStore(query.trim())}
              disabled={!query.trim()}
              accessibilityRole="button"
              accessibilityLabel="Search on Play Store"
              style={[
                styles.playStoreBtn,
                { backgroundColor: colors.systemGray5, opacity: query.trim() ? 1 : 0.5 },
              ]}
            >
              <Text style={[typography.body, styles.playStoreLabel, { color: colors.systemBlue }]}>
                Search on Play Store
              </Text>
            </Pressable>
          </>
        ) : tabIndex === 2 ? (
          <>
            {categorySections.map((section) => (
              <View key={section.name} style={styles.categorySection}>
                <Text style={[typography.title3, styles.categorySectionTitle, { color: colors.label }]}>
                  {section.name}
                </Text>
                {section.items.map((app) => (
                  <AppRow
                onPressCard={openDetail}
                    key={app.packageName}
                    app={app}
                    installed={installedPackages.has(app.packageName)}
                    onOpen={handleOpen}
                    onGet={handleGet}
                  />
                ))}
              </View>
            ))}
          </>
        ) : (
          <UpdatesTab apps={updatableCandidates} onCheck={handleCheckUpdate} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
  },
  root: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  segmentedWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  playStoreBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  playStoreLabel: {
    fontWeight: '600',
  },
  sectionTitle: {
    fontWeight: '700',
  },
  sectionNote: {
    marginTop: 2,
    marginBottom: 12,
  },
  categorySection: {
    marginBottom: 20,
  },
  categorySectionTitle: {
    fontWeight: '700',
    marginBottom: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 10,
  },
  iconPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    paddingHorizontal: 12,
  },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
  },
  actionLabel: {
    fontWeight: '700',
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
  updatesNotice: {
    marginTop: 2,
    marginBottom: 12,
    lineHeight: 19,
  },
  updatesEmpty: {
    marginTop: 4,
  },
  updateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 10,
    borderRadius: 12,
  },
  updateActionLabel: {
    fontWeight: '700',
  },
});
