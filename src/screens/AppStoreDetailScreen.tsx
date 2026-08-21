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
import { CupertinoNavigationBar } from '../components';
import { useTheme } from '../theme/ThemeContext';
import { useApps } from '../store/AppsStore';
import { CURATED_APPS } from '../data/curatedApps';
import { playStoreUrl, playStoreWebUrl } from './AppStoreScreen';
import type { AppNavigationProp, AppRouteProp } from '../navigation/types';
import { logger } from '../utils/logger';

/**
 * Package-name prefix of this app's own virtual built-ins (Phone, Messages, …).
 *
 * Those packages are not real installed APKs — they are synthesised entries that
 * route to internal screens (`BUILT_IN_APPS` in `LauncherHomeScreen.tsx`), so
 * `PackageInstaller` has nothing to uninstall for them. The prefix is used
 * instead of importing `BUILT_IN_APPS` to avoid pulling the whole launcher home
 * screen (Reanimated worklets included) into this screen's module graph; every
 * entry of that map lives under this namespace.
 */
const VIRTUAL_PACKAGE_PREFIX = 'com.iostoandroid.';

export function isVirtualBuiltIn(packageName: string): boolean {
  return packageName.startsWith(VIRTUAL_PACKAGE_PREFIX);
}

/**
 * Same dynamic-import guard as `LauncherHomeScreen.tsx`, plus the `require`
 * fallback that `AppsStore.tsx` already documents: Jest runs without
 * `--experimental-vm-modules`, so `import()` throws
 * ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG there and the module would be
 * silently unreachable under test. Metro supports `require`, so production
 * behaviour is unchanged and the moduleNameMapper mock still applies.
 */
const getLauncher = async () => {
  try {
    return (await import('../../modules/launcher-module/src')).default;
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro supports require; fallback for environments without dynamic import
      return require('../../modules/launcher-module/src').default;
    } catch {
      return null; // Expected: module unavailable on non-Android
    }
  }
};

interface AppStoreDetailScreenProps {
  navigation: AppNavigationProp;
  route: AppRouteProp<'AppStoreDetail'>;
}

export function AppStoreDetailScreen({ navigation, route }: AppStoreDetailScreenProps) {
  const { packageName, name } = route.params;
  const { theme, isDark, typography, borderRadius } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { apps, launchApp } = useApps();
  const [uninstallRequested, setUninstallRequested] = useState(false);

  const installed = useMemo(
    () => apps.find((a) => a.packageName === packageName) ?? null,
    [apps, packageName],
  );

  const curated = useMemo(
    () => CURATED_APPS.find((a) => a.packageName === packageName) ?? null,
    [packageName],
  );

  // Uninstall is only meaningful for a real, user-installed APK: system apps
  // cannot be removed and virtual built-ins are not packages at all.
  const canUninstall = !!installed && !installed.isSystem && !isVirtualBuiltIn(packageName);

  const handleOpen = useCallback(() => {
    launchApp(packageName);
  }, [launchApp, packageName]);

  // Same probe-then-fallback guard as AppStoreScreen's Get button: market://
  // has no handler on de-Googled devices and on most emulators.
  const handleGet = useCallback(async () => {
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
      logger.warn('AppStoreDetailScreen', 'could not open store listing', err);
    }
  }, [packageName]);

  const handleUninstall = useCallback(async () => {
    // Guard against the double tap: the system uninstall dialog is async, and a
    // second press would queue a second PackageInstaller intent.
    if (uninstallRequested) return;
    setUninstallRequested(true);
    try {
      const mod = await getLauncher();
      if (mod) await mod.uninstallApp(packageName);
    } catch (err) {
      logger.warn('AppStoreDetailScreen', 'uninstall failed', err);
    }
  }, [packageName, uninstallRequested]);

  return (
    <View style={styles.screenRoot}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <CupertinoNavigationBar
        title={name}
        largeTitle={false}
        leftButton={
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityRole="button"
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
        <View style={styles.header}>
          <View style={[styles.iconPlaceholder, { backgroundColor: colors.systemGray5 }]}>
            <Ionicons name="cube-outline" size={34} color={colors.secondaryLabel} />
          </View>
          <View style={styles.headerText}>
            <Text style={[typography.title3, styles.appName, { color: colors.label }]} numberOfLines={2}>
              {name}
            </Text>
            <Text
              style={[typography.footnote, { color: colors.secondaryLabel }]}
              numberOfLines={2}
              accessibilityLabel="App tagline"
            >
              {curated ? curated.tagline : 'Installed app'}
            </Text>
            <Text style={[typography.caption1, { color: colors.tertiaryLabel }]} numberOfLines={1}>
              {curated ? curated.category : packageName}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          {installed ? (
            <Pressable
              onPress={handleOpen}
              accessibilityRole="button"
              accessibilityLabel={`Open ${name}`}
              style={[styles.actionBtn, { backgroundColor: colors.systemGray5, borderRadius: borderRadius.medium }]}
            >
              <Text style={[typography.body, styles.actionLabel, { color: colors.systemBlue }]}>
                Open
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleGet}
              accessibilityRole="button"
              accessibilityLabel={`Get ${name}`}
              style={[styles.actionBtn, { backgroundColor: colors.systemGray5, borderRadius: borderRadius.medium }]}
            >
              <Text style={[typography.body, styles.actionLabel, { color: colors.systemBlue }]}>
                Get
              </Text>
            </Pressable>
          )}

          {canUninstall && (
            <Pressable
              onPress={handleUninstall}
              accessibilityRole="button"
              accessibilityLabel={`Uninstall ${name}`}
              style={[styles.actionBtn, { backgroundColor: colors.systemGray5, borderRadius: borderRadius.medium }]}
            >
              <Text style={[typography.body, styles.actionLabel, { color: colors.systemRed }]}>
                Uninstall
              </Text>
            </Pressable>
          )}
        </View>

        <Text style={[typography.headline, styles.sectionTitle, { color: colors.label }]}>
          Screenshots
        </Text>
        <View
          style={[
            styles.placeholderBlock,
            { backgroundColor: colors.secondarySystemGroupedBackground, borderRadius: borderRadius.medium },
          ]}
          accessibilityLabel="Screenshots placeholder"
        >
          <Ionicons name="image-outline" size={28} color={colors.tertiaryLabel} />
          <Text style={[typography.footnote, { color: colors.secondaryLabel }]}>
            Screenshots not available
          </Text>
        </View>

        <Text style={[typography.headline, styles.sectionTitle, { color: colors.label }]}>
          Description
        </Text>
        <View
          style={[
            styles.placeholderBlock,
            { backgroundColor: colors.secondarySystemGroupedBackground, borderRadius: borderRadius.medium },
          ]}
          accessibilityLabel="Description placeholder"
        >
          <Text style={[typography.footnote, { color: colors.secondaryLabel }]}>
            Description not available
          </Text>
        </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    paddingHorizontal: 12,
  },
  appName: {
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 16,
  },
  actionBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginRight: 10,
  },
  actionLabel: {
    fontWeight: '600',
  },
  sectionTitle: {
    marginTop: 24,
    marginBottom: 8,
    fontWeight: '700',
  },
  placeholderBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    gap: 8,
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
