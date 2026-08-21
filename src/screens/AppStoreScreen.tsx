import React, { useCallback, useMemo } from 'react';
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
import { CupertinoNavigationBar } from '../components';
import { useTheme } from '../theme/ThemeContext';
import { useApps } from '../store/AppsStore';
import { CURATED_APPS, type CuratedApp } from '../data/curatedApps';
import type { AppNavigationProp } from '../navigation/types';
import { logger } from '../utils/logger';

/** Play Store deep link for a single app listing. */
export function playStoreUrl(packageName: string): string {
  return `market://details?id=${packageName}`;
}

/** Web fallback used when no Play Store client can handle `market://`. */
export function playStoreWebUrl(packageName: string): string {
  return `https://play.google.com/store/apps/details?id=${packageName}`;
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function AppRow({
  app,
  installed,
  onOpen,
  onGet,
}: {
  app: CuratedApp;
  installed: boolean;
  onOpen: (packageName: string) => void;
  onGet: (packageName: string) => void;
}) {
  const { theme, typography, borderRadius } = useTheme();
  const { colors } = theme;

  return (
    <View
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
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function AppStoreScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, isDark, typography } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { apps, launchApp } = useApps();

  // Set of installed package names — lookup is by packageName only, never by
  // display name, so a user-renamed app still resolves as installed.
  const installedPackages = useMemo(
    () => new Set(apps.map((a) => a.packageName)),
    [apps],
  );

  const handleOpen = useCallback(
    (packageName: string) => {
      launchApp(packageName);
    },
    [launchApp],
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

      <ScrollView
        style={[styles.root, { backgroundColor: colors.systemGroupedBackground }]}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[typography.title1, styles.sectionTitle, { color: colors.label }]}>Today</Text>
        <Text style={[typography.footnote, styles.sectionNote, { color: colors.secondaryLabel }]}>
          A hand-picked selection — not live Play Store data.
        </Text>

        {CURATED_APPS.map((app) => (
          <AppRow
            key={app.packageName}
            app={app}
            installed={installedPackages.has(app.packageName)}
            onOpen={handleOpen}
            onGet={handleGet}
          />
        ))}
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
  sectionTitle: {
    fontWeight: '700',
  },
  sectionNote: {
    marginTop: 2,
    marginBottom: 12,
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
});
