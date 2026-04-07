import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  StatusBar,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TextInput,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as NavigationBar from 'expo-navigation-bar';

import { useApps, InstalledApp } from '../store/AppsStore';
import { useSettings } from '../store/SettingsStore';
import { useTheme } from '../theme/ThemeContext';
import { useDevice } from '../store/DeviceStore';
import { useFolders, AppFolder } from '../store/FoldersStore';
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
const COLS = Math.min(4, Math.floor(SCREEN_WIDTH / 90));
const ROWS = 6;
const APPS_PER_PAGE = COLS * ROWS; // 24
const ICON_SIZE = 60;
const GRID_HORIZONTAL_PADDING = 16;
const CELL_WIDTH = (SCREEN_WIDTH - GRID_HORIZONTAL_PADDING * 2) / COLS;
const DOCK_CELL_WIDTH = (SCREEN_WIDTH - 32) / 4; // dock has 16px padding each side

// Built-in app routing: packageName → navigation screen name
const BUILT_IN_APPS: Record<string, string> = {
  'com.iostoandroid.phone': 'Phone',
  'com.iostoandroid.messages': 'Messages',
  'com.iostoandroid.contacts': 'Contacts',
  'com.iostoandroid.settings': 'Settings',
};

// Icon config for virtual (built-in) apps rendered in dock/grid
const VIRTUAL_ICON_CONFIG: Record<string, {
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  gradient?: [string, string];
  iconSize?: number;
}> = {
  'com.iostoandroid.phone': { icon: 'call', bg: '#34C759', gradient: ['#65D36E', '#1FB940'], iconSize: 34 },
  'com.iostoandroid.messages': { icon: 'chatbubble-sharp', bg: '#34C759', gradient: ['#65D36E', '#1FB940'], iconSize: 34 },
  'com.iostoandroid.contacts': { icon: 'people', bg: '#FF9500', gradient: ['#FFA733', '#FF8800'], iconSize: 34 },
  'com.iostoandroid.settings': { icon: 'settings-sharp', bg: '#8E8E93', gradient: ['#8E8E93', '#636366'], iconSize: 34 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// ---------------------------------------------------------------------------
// Dynamic Island
// ---------------------------------------------------------------------------

function DynamicIsland({ device, settings }: { device: any; settings: any }) {
  const isCharging = device.battery.isCharging;
  const hasDND = settings.focusMode !== 'off';

  if (!isCharging && !hasDND) return null;

  return (
    <View style={styles.dynamicIsland}>
      {isCharging && (
        <>
          <Ionicons name="flash" size={12} color="#34C759" />
          <Text style={styles.dynamicIslandText}>
            {Math.round(device.battery.level * 100)}%
          </Text>
        </>
      )}
      {hasDND && (
        <>
          <Ionicons name="moon" size={12} color="#5856D6" />
          <Text style={styles.dynamicIslandText}>Focus</Text>
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface AppIconProps {
  app: InstalledApp;
  cellWidth: number;
  onPress: () => void;
  onLongPress: () => void;
  isJiggling?: boolean;
  onDelete?: () => void;
  badge?: number;
}

function AppIcon({ app, cellWidth, onPress, onLongPress, isJiggling, onDelete, badge }: AppIconProps) {
  const virtualCfg = VIRTUAL_ICON_CONFIG[app.packageName];
  const rotation = useSharedValue(0);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    if (isJiggling) {
      rotation.value = withRepeat(
        withSequence(
          withTiming(-2, { duration: 100 }),
          withTiming(2, { duration: 100 }),
        ),
        -1,
        true,
      );
    } else {
      rotation.value = withTiming(0, { duration: 100 });
    }
  }, [isJiggling]); // eslint-disable-line react-hooks/exhaustive-deps

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${rotation.value}deg` },
      { scale: pressScale.value },
    ],
  }));

  const handlePressIn = useCallback(() => {
    if (isJiggling) return;
    // eslint-disable-next-line react-hooks/immutability
    pressScale.value = withSpring(0.85, { damping: 12, stiffness: 200 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isJiggling, pressScale]);

  const handlePressOut = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability
    pressScale.value = withSpring(1.0, { damping: 12, stiffness: 200 });
  }, [pressScale]);

  return (
    <Pressable
      style={[styles.appIconWrapper, { width: cellWidth }]}
      onPress={isJiggling ? undefined : onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onLongPress={onLongPress}
      android_ripple={isJiggling ? null : { color: 'rgba(255,255,255,0.2)', radius: ICON_SIZE / 2 }}
      accessibilityLabel={`Open ${app.name}`}
      accessibilityRole="button"
    >
      <Animated.View style={animatedStyle}>
        {virtualCfg ? (
          virtualCfg.gradient ? (
            <LinearGradient
              colors={virtualCfg.gradient}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.appIconPlaceholder}
            >
              <Ionicons name={virtualCfg.icon} size={virtualCfg.iconSize ?? 28} color="#fff" />
            </LinearGradient>
          ) : (
            <View style={[styles.appIconPlaceholder, { backgroundColor: virtualCfg.bg }]}>
              <Ionicons name={virtualCfg.icon} size={virtualCfg.iconSize ?? 28} color="#fff" />
            </View>
          )
        ) : app.icon ? (
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
        {badge != null && badge > 0 && (
          <View style={{
            position: 'absolute',
            top: 0,
            right: (cellWidth - ICON_SIZE) / 2 - 4,
            backgroundColor: '#FF3B30',
            borderRadius: 9,
            minWidth: 18,
            height: 18,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 4,
            borderWidth: 2,
            borderColor: 'rgba(0,0,0,0.3)',
          }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
              {badge > 99 ? '99+' : String(badge)}
            </Text>
          </View>
        )}
        {isJiggling && (
          <Pressable
            style={styles.jiggleDeleteBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              onDelete?.();
            }}
            hitSlop={4}
            accessibilityLabel={`Remove ${app.name}`}
            accessibilityRole="button"
          >
            <Text style={styles.jiggleDeleteX}>✕</Text>
          </Pressable>
        )}
      </Animated.View>
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
// Grid item type
// ---------------------------------------------------------------------------

type GridItem =
  | { type: 'app'; app: InstalledApp }
  | { type: 'folder'; folder: AppFolder };

// ---------------------------------------------------------------------------
// FolderIcon
// ---------------------------------------------------------------------------

function FolderIcon({ folder, cellWidth, apps, onPress, onLongPress }: {
  folder: AppFolder;
  cellWidth: number;
  apps: InstalledApp[];
  onPress: () => void;
  onLongPress: () => void;
}) {
  const folderApps = folder.apps
    .map(pkg => apps.find(a => a.packageName === pkg))
    .filter(Boolean)
    .slice(0, 9) as InstalledApp[];

  return (
    <Pressable
      style={[styles.appIconWrapper, { width: cellWidth }]}
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: 'rgba(255,255,255,0.2)', radius: ICON_SIZE / 2 }}
      accessibilityLabel={`Open ${folder.name} folder`}
      accessibilityRole="button"
    >
      <View style={[styles.folderIcon, { backgroundColor: folder.color }]}>
        <View style={styles.folderGrid}>
          {folderApps.map((app, i) =>
            app?.icon ? (
              <Image key={i} source={{ uri: app.icon }} style={styles.folderMiniIcon} />
            ) : (
              <View key={i} style={[styles.folderMiniIcon, { backgroundColor: 'rgba(255,255,255,0.3)' }]} />
            )
          )}
        </View>
      </View>
      <Text style={styles.appIconLabel} numberOfLines={1}>{folder.name}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// FolderOverlay
// ---------------------------------------------------------------------------

function FolderOverlay({ folder, apps, onClose, onLaunchApp, onLongPressApp, onRename }: {
  folder: AppFolder;
  apps: InstalledApp[];
  onClose: () => void;
  onLaunchApp: (app: InstalledApp) => void;
  onLongPressApp: (app: InstalledApp) => void;
  onRename: (newName: string) => void;
}) {
  const folderApps = folder.apps
    .map(pkg => apps.find(a => a.packageName === pkg))
    .filter(Boolean) as InstalledApp[];

  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(folder.name);

  const commitRename = useCallback(() => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== folder.name) {
      onRename(trimmed);
    } else {
      setNameValue(folder.name);
    }
    setEditing(false);
  }, [nameValue, folder.name, onRename]);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.folderOverlayBackdrop} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()}>
          <BlurView intensity={60} tint="dark" experimentalBlurMethod="dimezisBlurView" style={styles.folderOverlayCard}>
            {editing ? (
              <TextInput
                style={styles.folderOverlayTitleInput}
                value={nameValue}
                onChangeText={setNameValue}
                onBlur={commitRename}
                onSubmitEditing={commitRename}
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
              />
            ) : (
              <Pressable onPress={() => setEditing(true)} accessibilityLabel={`Rename folder ${folder.name}`} accessibilityRole="button">
                <Text style={styles.folderOverlayTitle}>{folder.name}</Text>
              </Pressable>
            )}
            <View style={styles.folderOverlayGrid}>
              {folderApps.map(app => (
                <AppIcon
                  key={app.packageName}
                  app={app}
                  cellWidth={70}
                  onPress={() => onLaunchApp(app)}
                  onLongPress={() => onLongPressApp(app)}
                />
              ))}
            </View>
          </BlurView>
        </Pressable>
      </Pressable>
    </Modal>
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
    apps,
    nonDockApps,
    dockApps,
    isLoading,
    launchApp,
    isDefaultLauncher,
    openLauncherSettings,
    addToDock,
    removeFromDock,
    removeFromHome,
  } = useApps();
  const { settings } = useSettings();
  const device = useDevice();
  const { folders, createFolder, renameFolder, addToFolder, getFolderForApp } = useFolders();
  const { theme: launcherTheme } = useTheme();
  const colors = launcherTheme.colors;

  // Folder open state
  const [openFolder, setOpenFolder] = useState<AppFolder | null>(null);

  // Unified app press handler — routes built-in apps to internal screens
  const handleAppPress = useCallback((app: InstalledApp) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const internalRoute = BUILT_IN_APPS[app.packageName];
    if (internalRoute) {
      navigation.navigate(internalRoute);
    } else {
      launchApp(app.packageName);
    }
  }, [navigation, launchApp]);

  // Standalone navigation wrappers for runOnJS (can't call navigation.navigate directly from worklet)
  const navigateTo = useCallback((screen: string) => {
    navigation.navigate(screen);
  }, [navigation]);

  const navigateToWithParams = useCallback((screen: string, params: object) => {
    navigation.navigate(screen, params);
  }, [navigation]);

  // Vertical swipe gesture: up → App Drawer, down-top-left → Notification Center, down-top-right → Control Center, down-mid → Spotlight
  const panGesture = Gesture.Pan()
    .activeOffsetY([-20, 20])
    .onEnd((event) => {
      'worklet';
      const { translationY, absoluteY, absoluteX, velocityY } = event;

      if (translationY < -60 && velocityY < -200) {
        runOnJS(navigateTo)('AppLibrary');
      } else if (translationY > 60 && velocityY > 200 && absoluteY < 350) {
        if (absoluteX < SCREEN_WIDTH / 2) {
          runOnJS(navigateTo)('NotificationCenter');
        } else {
          runOnJS(navigateTo)('ControlCenter');
        }
      } else if (translationY > 60 && velocityY > 200 && absoluteY >= 350) {
        runOnJS(navigateTo)('SpotlightSearch');
      }
    });

  // Request permissions on first launch
  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'android') return;
      try {
        const mod = (await import('../../modules/launcher-module/src')).default;
        const perms = await mod.checkPermissions();
        const needsPermission = Object.values(perms).some(v => !v);
        if (needsPermission) {
          await mod.requestAllPermissions();
        }
      } catch { /* Expected: permissions check may fail on non-Android or first install */ }
    })();
  }, []);

  // Immersive mode — hide system bars so the launcher owns the full screen
  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync('hidden');
      NavigationBar.setBehaviorAsync('overlay-swipe');
      StatusBar.setTranslucent(true);
      StatusBar.setBackgroundColor('transparent');
    }
  }, []);

  // Clock state
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Jiggle (edit) mode state
  const [isJiggling, setIsJiggling] = useState(false);

  const exitJiggle = useCallback(() => {
    setIsJiggling(false);
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

  const handleLongPress = useCallback((app: InstalledApp) => {
    if (isJiggling) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    openActionSheet(app);
  }, [isJiggling, openActionSheet]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  // Parallax wallpaper
  const scrollX = useSharedValue(0);
  const wallpaperAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -(scrollX.value * 0.3) }],
  }));

  // Custom wallpaper URI (loaded from AsyncStorage when wallpaperIndex === 6)
  const [customWallpaperUri, setCustomWallpaperUri] = useState<string | null>(null);
  useEffect(() => {
    AsyncStorage.getItem('@iostoandroid/custom_wallpaper').then(uri => {
      if (uri) setCustomWallpaperUri(uri);
    });
  }, []);

  // Badge counts computed from device data
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const badgeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const unread = device.messages.filter((m: { isRead: boolean }) => !m.isRead).length;
    if (unread > 0) counts['com.iostoandroid.messages'] = unread;
    return counts;
  }, [device.messages]);

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

  const WallpaperContent =
    settings.wallpaperIndex === 6 && customWallpaperUri ? (
      <ImageBackground
        source={{ uri: customWallpaperUri }}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' }} />
      </ImageBackground>
    ) : (
      <LinearGradient
        colors={[wallpaperColor, wallpaperDark]}
        style={StyleSheet.absoluteFillObject}
      />
    );

  // Build display items: virtual built-in apps + real apps + folders
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const gridItems = useMemo((): GridItem[] => {
    const items: GridItem[] = [];
    const appsInFolders = new Set(folders.flatMap(f => f.apps));
    const dockPkgs = new Set(dockApps.map(a => a.packageName));

    // Add virtual built-in apps to the grid (if not in dock)
    const virtualApps: InstalledApp[] = Object.entries(BUILT_IN_APPS).map(([pkg, name]) => ({
      name,
      packageName: pkg,
      icon: '',
      isSystem: false,
    }));
    for (const vApp of virtualApps) {
      if (!dockPkgs.has(vApp.packageName) && !appsInFolders.has(vApp.packageName)) {
        items.push({ type: 'app', app: vApp });
      }
    }

    // Add folders
    for (const folder of folders) {
      items.push({ type: 'folder', folder });
    }

    // Add real installed apps (not in dock, not in folders)
    for (const app of nonDockApps) {
      if (!appsInFolders.has(app.packageName)) {
        items.push({ type: 'app', app });
      }
    }
    return items;
  }, [nonDockApps, dockApps, folders]);

  // Paginate grid items
  const pages: GridItem[][] = [];
  for (let i = 0; i < gridItems.length; i += APPS_PER_PAGE) {
    pages.push(gridItems.slice(i, i + APPS_PER_PAGE));
  }
  // Ensure at least one page
  if (pages.length === 0) {
    pages.push([]);
  }

  // +1 for the App Library page appended at the end
  const totalPages = pages.length + 1;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    scrollX.value = offsetX;
    const page = Math.round(offsetX / SCREEN_WIDTH);
    if (page !== currentPage && page >= 0 && page < totalPages) {
      setCurrentPage(page);
      Haptics.selectionAsync();
    }
  };

  const handlePageScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollX.value = event.nativeEvent.contentOffset.x;
  };

  // Build "Move to Folder" sub-options for action sheet
  const buildMoveToFolderOptions = (app: InstalledApp) => {
    const currentFolder = getFolderForApp(app.packageName);
    const moveToExisting = folders
      .filter(f => f.id !== currentFolder?.id)
      .map(f => ({
        label: `Move to "${f.name}"`,
        onPress: () => {
          closeActionSheet();
          addToFolder(f.id, app.packageName);
        },
      }));

    return [
      {
        label: 'Create New Folder',
        onPress: () => {
          closeActionSheet();
          createFolder('New Folder', [app.packageName]);
        },
      },
      ...moveToExisting,
    ];
  };

  // Quick actions per built-in app (3D Touch style)
  const getQuickActions = (app: InstalledApp) => {
    const actions: Array<{ label: string; onPress: () => void }> = [];
    switch (app.packageName) {
      case 'com.iostoandroid.phone':
        actions.push({ label: 'New Call', onPress: () => { closeActionSheet(); navigation.navigate('Phone'); } });
        break;
      case 'com.iostoandroid.messages':
        actions.push({ label: 'New Message', onPress: () => { closeActionSheet(); navigation.navigate('Conversation', { address: '' }); } });
        break;
      case 'com.iostoandroid.contacts':
        actions.push({ label: 'Add Contact', onPress: () => { closeActionSheet(); navigation.navigate('ContactEdit'); } });
        break;
      case 'com.iostoandroid.settings':
        actions.push({ label: 'Wi-Fi', onPress: () => { closeActionSheet(); navigation.navigate('WiFi'); } });
        actions.push({ label: 'Bluetooth', onPress: () => { closeActionSheet(); navigation.navigate('Bluetooth'); } });
        break;
    }
    return actions;
  };

  // Helper to call native module lazily
  const getLauncher = async () => {
    try { return (await import('../../modules/launcher-module/src')).default; } catch { return null; } // Expected: module unavailable on non-Android
  };

  // Action sheet options for the selected app
  const actionSheetOptions = (() => {
    if (!actionSheet.app) return [];
    const app = actionSheet.app;
    const options: Array<{ label: string; onPress: () => void; destructive?: boolean }> = [];

    // Quick actions (3D Touch style)
    options.push(...getQuickActions(app));

    // Open
    options.push({
      label: 'Open',
      onPress: () => { closeActionSheet(); handleAppPress(app); },
    });

    // Dock: add or remove depending on current state
    const isInDock = dockApps.some(d => d.packageName === app.packageName);
    if (isInDock) {
      options.push({
        label: 'Remove from Dock',
        onPress: () => { closeActionSheet(); removeFromDock(app.packageName); },
      });
    } else {
      options.push({
        label: 'Add to Dock',
        onPress: () => { closeActionSheet(); addToDock(app.packageName); },
      });
    }

    // Move to folder
    options.push(...buildMoveToFolderOptions(app));

    // Edit home screen
    options.push({
      label: 'Edit Home Screen',
      onPress: () => { closeActionSheet(); setIsJiggling(true); },
    });

    // Launcher Settings
    options.push({
      label: 'Launcher Settings',
      onPress: () => { closeActionSheet(); navigation.navigate('LauncherSettings'); },
    });

    // Uninstall — only for real, non-system apps
    const isVirtual = !!BUILT_IN_APPS[app.packageName];
    const isSystem = app.isSystem;
    if (!isVirtual && !isSystem) {
      options.push({
        label: 'Uninstall',
        destructive: true,
        onPress: async () => {
          closeActionSheet();
          const mod = await getLauncher();
          if (mod) await mod.uninstallApp(app.packageName);
        },
      });
    }

    // Remove from home
    options.push({
      label: 'Remove from Home',
      destructive: true,
      onPress: () => { closeActionSheet(); removeFromHome(app.packageName); },
    });

    return options;
  })();

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.root, { overflow: 'hidden' }]}>
        {/* Parallax wallpaper — absolute layer, slightly oversized to allow horizontal shift */}
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            { left: -20, right: -20 },
            wallpaperAnimStyle,
          ]}
        >
          {WallpaperContent}
        </Animated.View>

        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* ---------------------------------------------------------------- */}
      {/* Jiggle-mode background tap target (exits edit mode)               */}
      {/* ---------------------------------------------------------------- */}
      {isJiggling && (
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={exitJiggle}
          accessibilityLabel="Exit edit mode"
          accessibilityRole="button"
        />
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Set-as-default banner                                             */}
      {/* ---------------------------------------------------------------- */}
      {!isDefaultLauncher && !isJiggling && (
        <View style={[styles.defaultBanner, { marginTop: insets.top }]}>
          <Text style={styles.defaultBannerText}>Set as default launcher</Text>
          <Pressable
            style={[styles.defaultBannerButton, { backgroundColor: colors.accent }]}
            onPress={openLauncherSettings}
            android_ripple={{ color: 'rgba(255,255,255,0.3)' }}
            accessibilityLabel="Set as default launcher"
            accessibilityRole="button"
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
        <Pressable onPress={() => navigateTo('NotificationCenter')} accessibilityLabel="Open Notification Center" accessibilityRole="button">
          <Text style={styles.statusTime}>{formatTime(now)}</Text>
        </Pressable>
        <Pressable style={styles.statusRight} onPress={() => navigateTo('ControlCenter')} accessibilityLabel="Open Control Center" accessibilityRole="button">
          {settings.focusMode !== 'off' && (
            <Ionicons name="moon" size={14} color="rgba(255,255,255,0.85)" style={{ marginRight: 6 }} />
          )}
          {device.network?.isCellular && (
            <Ionicons name="cellular" size={14} color="rgba(255,255,255,0.85)" style={{ marginRight: 6 }} />
          )}
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
          {/* Done button — visible only in jiggle mode */}
          {isJiggling && (
            <Pressable
              style={styles.jiggleDoneBtn}
              onPress={exitJiggle}
              accessibilityLabel="Done"
              accessibilityRole="button"
            >
              <Text style={styles.jiggleDoneBtnText}>Done</Text>
            </Pressable>
          )}
        </Pressable>
      </View>

      {/* Dynamic Island placeholder */}
      <DynamicIsland device={device} settings={settings} />

      {/* ---------------------------------------------------------------- */}
      {/* Swipeable app pages                                                */}
      {/* ---------------------------------------------------------------- */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handlePageScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleScroll}
        style={styles.pagerContainer}
        contentContainerStyle={styles.pagerContent}
        scrollEnabled={!isJiggling}
      >
        {pages.map((pageItems, pageIndex) => (
          <View key={pageIndex} style={styles.page}>
            <View style={styles.pageGrid}>
              {pageItems.map((item) => {
                if (item.type === 'folder') {
                  return (
                    <FolderIcon
                      key={`folder-${item.folder.id}`}
                      folder={item.folder}
                      cellWidth={CELL_WIDTH}
                      apps={apps}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setOpenFolder(item.folder); }}
                      onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setIsJiggling(true); }}
                    />
                  );
                }
                return (
                  <AppIcon
                    key={item.app.packageName}
                    app={item.app}
                    cellWidth={CELL_WIDTH}
                    onPress={() => handleAppPress(item.app)}
                    onLongPress={() => handleLongPress(item.app)}
                    isJiggling={isJiggling}
                    badge={badgeCounts[item.app.packageName]}
                    onDelete={() => {
                      removeFromHome(item.app.packageName);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  />
                );
              })}
            </View>
          </View>
        ))}

        {/* App Library page — always the last swipeable page */}
        <Pressable
          key="app-library"
          style={[styles.page, styles.appLibraryPage]}
          onPress={() => navigation.navigate('AppLibrary')}
          accessibilityLabel="Open App Library"
          accessibilityRole="button"
        >
          <Ionicons name="grid" size={52} color="rgba(255,255,255,0.7)" />
          <Text style={styles.appLibraryText}>App Library</Text>
          <Text style={styles.appLibrarySubtext}>Tap to open all apps</Text>
        </Pressable>
      </ScrollView>

      {/* ---------------------------------------------------------------- */}
      {/* Page dots + Search label (iOS 16/17 style)                         */}
      {/* ---------------------------------------------------------------- */}
      <PageDots total={totalPages} current={currentPage} />
      <Pressable
        style={styles.searchLabel}
        onPress={isJiggling ? exitJiggle : () => navigation.navigate('SpotlightSearch')}
        accessibilityLabel="Search apps"
        accessibilityRole="search"
      >
        <Text style={styles.searchLabelText}>{isJiggling ? 'Tap background to exit' : 'Search'}</Text>
      </Pressable>

      {/* ---------------------------------------------------------------- */}
      {/* Dock                                                               */}
      {/* ---------------------------------------------------------------- */}
      <View style={[styles.dockOuter, { paddingBottom: insets.bottom + 16 }]}>
        <BlurView
          intensity={90}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={styles.dockBlur}
        >
          <View style={styles.dockRow}>
            {dockApps.slice(0, 4).map((app) => (
              <AppIcon
                key={app.packageName}
                app={app}
                cellWidth={DOCK_CELL_WIDTH}
                onPress={() => handleAppPress(app)}
                onLongPress={() => handleLongPress(app)}
                isJiggling={isJiggling}
                badge={badgeCounts[app.packageName]}
                onDelete={() => {
                  removeFromHome(app.packageName);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
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
      {/* Folder overlay                                                     */}
      {/* ---------------------------------------------------------------- */}
      {openFolder && (
        <FolderOverlay
          folder={openFolder}
          apps={apps}
          onClose={() => setOpenFolder(null)}
          onLaunchApp={(app) => {
            setOpenFolder(null);
            handleAppPress(app);
          }}
          onLongPressApp={(app) => {
            setOpenFolder(null);
            handleLongPress(app);
          }}
          onRename={(newName) => {
            renameFolder(openFolder.id, newName);
            setOpenFolder(prev => prev ? { ...prev, name: newName } : null);
          }}
        />
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Action sheet                                                       */}
      {/* ---------------------------------------------------------------- */}
      <CupertinoActionSheet
        visible={actionSheet.visible}
        onClose={closeActionSheet}
        title={actionSheet.app?.name}
        options={actionSheetOptions}
      />

      {/* ---------------------------------------------------------------- */}
      {/* Home indicator bar (iOS-style)                                     */}
      {/* ---------------------------------------------------------------- */}
      <View style={[styles.homeIndicator, { bottom: insets.bottom + 2 }]}>
        <View style={styles.homeIndicatorBar} />
      </View>
      </Animated.View>
    </GestureDetector>
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

  // Folder icon (grid cell)
  folderIcon: {
    width: 60,
    height: 60,
    borderRadius: 14,
    padding: 6,
    overflow: 'hidden',
  },
  folderGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  folderMiniIcon: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },

  // Folder overlay
  folderOverlayBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  folderOverlayCard: {
    width: SCREEN_WIDTH * 0.8,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(30,30,30,0.6)',
  },
  folderOverlayTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  folderOverlayTitleInput: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.4)',
    paddingBottom: 4,
  },
  folderOverlayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },

  // Jiggle (edit) mode
  jiggleDeleteBtn: {
    position: 'absolute',
    top: -5,
    left: -5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(90,90,90,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  jiggleDeleteX: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  jiggleDoneBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginLeft: 8,
  },
  jiggleDoneBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },

  // App Library page
  appLibraryPage: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  appLibraryText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 22,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  appLibrarySubtext: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    fontWeight: '400',
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

  // Dynamic Island
  dynamicIsland: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 4,
  },
  dynamicIslandText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // Home indicator bar (iOS-style)
  homeIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  homeIndicatorBar: {
    width: 134,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
});
