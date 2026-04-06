import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  StatusBar,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { useApps, InstalledApp } from '../store/AppsStore';
import { useSettings } from '../store/SettingsStore';
import { useTheme } from '../theme/ThemeContext';
import { useDevice } from '../store/DeviceStore';
import {
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

const SCREEN_WIDTH = Dimensions.get('window').width;
const COLS = 4;
const ROWS = 6;
const APPS_PER_PAGE = COLS * ROWS; // 24
const ICON_SIZE = 60;
const GRID_HORIZONTAL_PADDING = 20;
const CELL_WIDTH = (SCREEN_WIDTH - GRID_HORIZONTAL_PADDING * 2) / COLS;
const DOCK_CELL_WIDTH = (SCREEN_WIDTH - 32) / 4; // dock has 16px padding each side

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface AppIconProps {
  app: InstalledApp;
  cellWidth: number;
  onPress: () => void;
  onLongPress: () => void;
}

function AppIcon({ app, cellWidth, onPress, onLongPress }: AppIconProps) {
  return (
    <Pressable
      style={[styles.appIconWrapper, { width: cellWidth }]}
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: 'rgba(255,255,255,0.2)', radius: ICON_SIZE / 2 }}
    >
      {app.icon ? (
        <Image
          source={{ uri: app.icon }}
          style={styles.appIconImage}
          resizeMode="contain"
        />
      ) : (
        <View style={styles.appIconPlaceholder}>
          <Ionicons name="apps" size={28} color="#fff" />
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
  if (total <= 1) return null;
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
  const device = useDevice();

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

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

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

  // Split non-dock apps into pages of 24
  const pages: InstalledApp[][] = [];
  for (let i = 0; i < nonDockApps.length; i += APPS_PER_PAGE) {
    pages.push(nonDockApps.slice(i, i + APPS_PER_PAGE));
  }
  // Ensure at least one page
  if (pages.length === 0) {
    pages.push([]);
  }

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const page = Math.round(offsetX / SCREEN_WIDTH);
    if (page !== currentPage && page >= 0 && page < pages.length) {
      setCurrentPage(page);
    }
  };

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
          {device.wifi.enabled && (
            <Ionicons name="wifi" size={14} color="rgba(255,255,255,0.85)" style={{ marginRight: 6 }} />
          )}
          {settings.batteryPercentage && (
            <View style={styles.batteryPill}>
              {device.battery.isCharging && (
                <Ionicons name="flash" size={12} color="rgba(255,255,255,0.85)" />
              )}
              <Ionicons
                name="battery-half-outline"
                size={14}
                color="rgba(255,255,255,0.85)"
              />
              <Text style={styles.batteryText}>
                {Math.round(device.battery.level * 100)}%
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* No clock widget — iOS home screen has no clock (lock screen only) */}

      {/* ---------------------------------------------------------------- */}
      {/* Swipeable app pages                                                */}
      {/* ---------------------------------------------------------------- */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        style={styles.pagerContainer}
        contentContainerStyle={styles.pagerContent}
      >
        {pages.map((pageApps, pageIndex) => (
          <View key={pageIndex} style={styles.page}>
            <View style={styles.pageGrid}>
              {pageApps.map((app) => (
                <AppIcon
                  key={app.packageName}
                  app={app}
                  cellWidth={CELL_WIDTH}
                  onPress={() => launchApp(app.packageName)}
                  onLongPress={() => openActionSheet(app)}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* ---------------------------------------------------------------- */}
      {/* Page dots + Search label (iOS 16/17 style)                         */}
      {/* ---------------------------------------------------------------- */}
      <PageDots total={pages.length} current={currentPage} />
      <Pressable
        style={styles.searchLabel}
        onPress={() => navigation.navigate('Contacts')}
        accessibilityLabel="Search apps"
        accessibilityRole="search"
      >
        <Text style={styles.searchLabelText}>Search</Text>
      </Pressable>

      {/* ---------------------------------------------------------------- */}
      {/* Dock                                                               */}
      {/* ---------------------------------------------------------------- */}
      <View style={[styles.dockOuter, { paddingBottom: insets.bottom + 8 }]}>
        <BlurView
          intensity={90}
          tint="dark"
          style={styles.dockBlur}
        >
          <View style={styles.dockRow}>
            {dockApps.slice(0, 4).map((app) => (
              <AppIcon
                key={app.packageName}
                app={app}
                cellWidth={DOCK_CELL_WIDTH}
                onPress={() => launchApp(app.packageName)}
                onLongPress={() => openActionSheet(app)}
              />
            ))}
            {/* Fill empty dock slots */}
            {Array.from({ length: Math.max(0, 4 - dockApps.length) }).map((_, i) => (
              <View key={`empty-${i}`} style={{ width: DOCK_CELL_WIDTH }} />
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
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
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

  // Search label — iOS 16/17 style (small text below page dots)
  searchLabel: {
    alignItems: 'center',
    paddingBottom: 6,
  },
  searchLabelText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
  },

  // Swipeable pages
  pagerContainer: {
    flex: 1,
  },
  pagerContent: {
    // no extra styles needed; children define width
  },
  page: {
    width: SCREEN_WIDTH,
    paddingHorizontal: GRID_HORIZONTAL_PADDING,
  },
  pageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  // App icons
  appIconWrapper: {
    alignItems: 'center',
    height: 88,
    justifyContent: 'flex-start',
    paddingTop: 5,
  },
  appIconImage: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 13.5,
    overflow: 'hidden',
  },
  appIconPlaceholder: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 13.5,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIconLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '500',
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
    paddingVertical: 4,
    gap: 4,
  },
  pageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
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
  dockBlur: {
    overflow: 'hidden',
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.3)',
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
