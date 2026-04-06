import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  FlatList,
  Platform,
  StatusBar,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { useApps, InstalledApp } from '../store/AppsStore';
import { useSettings } from '../store/SettingsStore';
import { useTheme } from '../theme/ThemeContext';
import {
  CupertinoSearchBar,
  CupertinoActivityIndicator,
  CupertinoActionSheet,
} from '../components';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WALLPAPERS: readonly string[] = [
  '#667eea',
  '#f093fb',
  '#4facfe',
  '#43e97b',
  '#fa709a',
  '#1C1C1E',
];

/** Darken a hex colour by `amount` (0-1) to build a gradient end stop. */
function darkenHex(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - Math.round(255 * amount));
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(255 * amount));
  const b = Math.max(0, (num & 0xff) - Math.round(255 * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

const GRID_COLUMNS = 4;
const MAX_GRID_APPS = 16;
const SCREEN_WIDTH = Dimensions.get('window').width;
const ICON_CELL_SIZE = (SCREEN_WIDTH - 32) / GRID_COLUMNS; // 16px padding each side

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface AppIconProps {
  app: InstalledApp;
  size: number;
  onPress: () => void;
  onLongPress: () => void;
}

function AppIcon({ app, size, onPress, onLongPress }: AppIconProps) {
  return (
    <Pressable
      style={[styles.appIconWrapper, { width: size }]}
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: 'rgba(255,255,255,0.2)', radius: size / 2 }}
    >
      {app.icon ? (
        <Image
          source={{ uri: app.icon }}
          style={[styles.appIconImage, { width: size * 0.8, height: size * 0.8, borderRadius: 14 }]}
          resizeMode="contain"
        />
      ) : (
        <View
          style={[
            styles.appIconPlaceholder,
            { width: size * 0.8, height: size * 0.8, borderRadius: 14 },
          ]}
        >
          <Ionicons name="apps" size={size * 0.4} color="#fff" />
        </View>
      )}
      <Text style={styles.appIconLabel} numberOfLines={1} ellipsizeMode="tail">
        {app.name}
      </Text>
    </Pressable>
  );
}

interface PageDotsProps {
  total: number;
  current: number;
}

function PageDots({ total, current }: PageDotsProps) {
  return (
    <View style={styles.pageDotsRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.pageDot,
            i === current ? styles.pageDotFilled : styles.pageDotEmpty,
          ]}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Fallback for non-Android
// ---------------------------------------------------------------------------

function NonAndroidFallback() {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();

  const wallpaper = WALLPAPERS[Math.min(settings.wallpaperIndex, WALLPAPERS.length - 1)] as string;
  const wallpaperDark = darkenHex(wallpaper, 0.25);

  return (
    <LinearGradient
      colors={[wallpaper, wallpaperDark]}
      style={[styles.root, { paddingTop: insets.top + 16 }]}
    >
      <View style={[styles.fallbackCard, { backgroundColor: colors.secondarySystemBackground }]}>
        <Ionicons name="phone-portrait-outline" size={48} color={colors.systemBlue} />
        <Text style={[typography.title2, { color: colors.label, marginTop: 12, textAlign: 'center' }]}>
          Launcher features require Android
        </Text>
        <Text
          style={[
            typography.body,
            { color: colors.secondaryLabel, marginTop: 8, textAlign: 'center' },
          ]}
        >
          Install this app as an APK on an Android device to use the home screen launcher.
        </Text>
      </View>

      {/* Battery widget */}
      <View
        style={[
          styles.fallbackWidget,
          { backgroundColor: colors.secondarySystemBackground, marginTop: spacing.lg },
        ]}
      >
        <View style={styles.widgetRow}>
          <Ionicons name="battery-half" size={24} color={colors.systemGreen} />
          <Text style={[typography.body, { color: colors.label, marginLeft: 8 }]}>
            Battery
          </Text>
          <Text
            style={[typography.body, { color: colors.secondaryLabel, marginLeft: 'auto' as unknown as number }]}
          >
            {settings.batteryPercentage ? '72%' : 'Hidden'}
          </Text>
        </View>
      </View>

      {/* Storage widget */}
      <View
        style={[
          styles.fallbackWidget,
          { backgroundColor: colors.secondarySystemBackground, marginTop: spacing.sm },
        ]}
      >
        <View style={styles.widgetRow}>
          <Ionicons name="server-outline" size={24} color={colors.systemBlue} />
          <Text style={[typography.body, { color: colors.label, marginLeft: 8 }]}>
            Storage
          </Text>
          <Text
            style={[typography.body, { color: colors.secondaryLabel, marginLeft: 'auto' as unknown as number }]}
          >
            4.2 GB used
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function LauncherHomeScreen() {
  const { theme, borderRadius } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>(); // eslint-disable-line @typescript-eslint/no-explicit-any

  const {
    nonDockApps,
    dockApps,
    isLoading,
    launchApp,
    isDefaultLauncher,
    openLauncherSettings,
    addToDock,
    removeFromHome,
  } = useApps();
  const { settings } = useSettings();

  // Clock state
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Action sheet state
  const [actionSheet, setActionSheet] = useState<{
    visible: boolean;
    app: InstalledApp | null;
  }>({ visible: false, app: null });

  const openActionSheet = useCallback((app: InstalledApp) => {
    setActionSheet({ visible: true, app });
  }, []);

  const closeActionSheet = useCallback(() => {
    setActionSheet({ visible: false, app: null });
  }, []);

  // Search state (for the tappable search bar)
  const [searchQuery] = useState('');

  // Non-Android fallback
  if (Platform.OS !== 'android' && !isLoading && nonDockApps.length === 0 && dockApps.length === 0) {
    return <NonAndroidFallback />;
  }

  // Loading
  if (isLoading) {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: '#1C1C1E' }]}>
        <CupertinoActivityIndicator />
      </View>
    );
  }

  // Wallpaper gradient
  const wallpaperColor =
    WALLPAPERS[Math.min(settings.wallpaperIndex, WALLPAPERS.length - 1)] as string;
  const wallpaperDark = darkenHex(wallpaperColor, 0.28);

  // Apps for grid: first 16 non-dock apps
  const gridApps = nonDockApps.slice(0, MAX_GRID_APPS);

  // Action sheet options for the selected app
  const actionSheetOptions = actionSheet.app
    ? [
        {
          label: 'Open',
          onPress: () => {
            closeActionSheet();
            if (actionSheet.app) launchApp(actionSheet.app.packageName);
          },
        },
        {
          label: 'Add to Dock',
          onPress: () => {
            closeActionSheet();
            if (actionSheet.app) addToDock(actionSheet.app.packageName);
          },
        },
        {
          label: 'Remove from Home',
          destructive: true,
          onPress: () => {
            closeActionSheet();
            if (actionSheet.app) removeFromHome(actionSheet.app.packageName);
          },
        },
      ]
    : [];

  return (
    <LinearGradient
      colors={[wallpaperColor, wallpaperDark]}
      style={styles.root}
    >
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* ---------------------------------------------------------------- */}
      {/* Set-as-default banner                                             */}
      {/* ---------------------------------------------------------------- */}
      {!isDefaultLauncher && (
        <View style={[styles.defaultBanner, { marginTop: insets.top }]}>
          <Text style={styles.defaultBannerText}>Set as default launcher</Text>
          <Pressable
            style={styles.defaultBannerButton}
            onPress={openLauncherSettings}
            android_ripple={{ color: 'rgba(255,255,255,0.3)' }}
          >
            <Text style={styles.defaultBannerButtonText}>Set Now</Text>
          </Pressable>
        </View>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Status bar row                                                     */}
      {/* ---------------------------------------------------------------- */}
      <View
        style={[
          styles.statusRow,
          {
            marginTop: isDefaultLauncher
              ? insets.top + 4
              : 4,
          },
        ]}
      >
        <Text style={styles.statusTime}>{formatTime(now)}</Text>
        <View style={styles.statusRight}>
          {settings.wifiEnabled && (
            <Ionicons name="wifi" size={14} color="rgba(255,255,255,0.85)" style={{ marginRight: 6 }} />
          )}
          {settings.batteryPercentage && (
            <View style={styles.batteryPill}>
              <Ionicons
                name={settings.lowPowerMode ? 'battery-dead-outline' : 'battery-half-outline'}
                size={14}
                color="rgba(255,255,255,0.85)"
              />
              <Text style={styles.batteryText}>
                {settings.lowPowerMode ? '20%' : '72%'}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ---------------------------------------------------------------- */}
      {/* Clock widget                                                       */}
      {/* ---------------------------------------------------------------- */}
      <View style={styles.clockWidget}>
        <Text style={styles.clockTime}>{formatTime(now)}</Text>
        <Text style={styles.clockDate}>{formatDate(now)}</Text>
      </View>

      {/* ---------------------------------------------------------------- */}
      {/* Search bar                                                         */}
      {/* ---------------------------------------------------------------- */}
      <Pressable
        style={styles.searchWrapper}
        onPress={() => {
          // Navigate to AppDrawer when it exists; for now show alert
          // navigation.navigate('AppDrawer', { focusSearch: true });
          navigation.navigate('Contacts'); // temporary placeholder
        }}
        accessibilityLabel="Search apps"
        accessibilityRole="search"
      >
        <View pointerEvents="none">
          <CupertinoSearchBar
            value={searchQuery}
            onChangeText={() => {}}
            placeholder="Search apps…"
            editable={false}
          />
        </View>
      </Pressable>

      {/* ---------------------------------------------------------------- */}
      {/* App grid                                                           */}
      {/* ---------------------------------------------------------------- */}
      <FlatList<InstalledApp>
        data={gridApps}
        keyExtractor={(item) => item.packageName}
        numColumns={GRID_COLUMNS}
        scrollEnabled={false}
        contentContainerStyle={styles.gridContent}
        renderItem={({ item }) => (
          <AppIcon
            app={item}
            size={ICON_CELL_SIZE}
            onPress={() => launchApp(item.packageName)}
            onLongPress={() => openActionSheet(item)}
          />
        )}
        style={styles.grid}
      />

      {/* ---------------------------------------------------------------- */}
      {/* Page dots                                                          */}
      {/* ---------------------------------------------------------------- */}
      <PageDots total={2} current={0} />

      {/* ---------------------------------------------------------------- */}
      {/* Dock                                                               */}
      {/* ---------------------------------------------------------------- */}
      <View style={[styles.dockOuter, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.dockSeparator} />
        <BlurView
          intensity={40}
          tint="dark"
          style={[styles.dockBlur, { borderRadius: borderRadius.extraLarge }]}
        >
          <View style={styles.dockRow}>
            {dockApps.slice(0, 4).map((app) => (
              <AppIcon
                key={app.packageName}
                app={app}
                size={ICON_CELL_SIZE}
                onPress={() => launchApp(app.packageName)}
                onLongPress={() => openActionSheet(app)}
              />
            ))}
            {/* Fill empty dock slots */}
            {Array.from({ length: Math.max(0, 4 - dockApps.length) }).map((_, i) => (
              <View key={`empty-${i}`} style={{ width: ICON_CELL_SIZE }} />
            ))}
          </View>
        </BlurView>
      </View>

      {/* ---------------------------------------------------------------- */}
      {/* Action sheet                                                       */}
      {/* ---------------------------------------------------------------- */}
      <CupertinoActionSheet
        visible={actionSheet.visible}
        onClose={closeActionSheet}
        title={actionSheet.app?.name}
        options={actionSheetOptions}
      />
    </LinearGradient>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Default launcher banner
  defaultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.55)',
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  defaultBannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  defaultBannerButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  defaultBannerButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // Status bar row
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 2,
  },
  statusTime: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '500',
  },
  statusRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  batteryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  batteryText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '500',
  },

  // Clock widget
  clockWidget: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  clockTime: {
    fontSize: 72,
    fontWeight: '200',
    color: '#ffffff',
    letterSpacing: -2,
    lineHeight: 80,
  },
  clockDate: {
    fontSize: 16,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },

  // Search
  searchWrapper: {
    marginHorizontal: 16,
    marginBottom: 16,
  },

  // App grid
  grid: {
    flex: 1,
    paddingHorizontal: 16,
  },
  gridContent: {
    paddingBottom: 8,
  },
  appIconWrapper: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  appIconImage: {
    // width / height set inline
  },
  appIconPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIconLabel: {
    marginTop: 4,
    fontSize: 11,
    color: '#ffffff',
    textAlign: 'center',
    width: '90%',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // Page dots
  pageDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 6,
  },
  pageDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  pageDotFilled: {
    backgroundColor: '#ffffff',
  },
  pageDotEmpty: {
    backgroundColor: 'rgba(255,255,255,0.4)',
  },

  // Dock
  dockOuter: {
    paddingHorizontal: 12,
  },
  dockSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 8,
  },
  dockBlur: {
    overflow: 'hidden',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dockRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },

  // Fallback
  fallbackCard: {
    marginHorizontal: 24,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  fallbackWidget: {
    marginHorizontal: 24,
    borderRadius: 12,
    padding: 16,
  },
  widgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
