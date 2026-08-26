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
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SystemAppIcon } from '../components/SystemAppIcon';
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

import { addHomePressedListener, LauncherModuleType } from '../../modules/launcher-module/src';
import { useApps, InstalledApp, HomeApp } from '../store/AppsStore';
import { AppLibraryContent } from './AppLibraryScreen';
import { useSettings } from '../store/SettingsStore';
import { scrollDecelerationValue } from '../utils/motionIntensity';
import { useTheme } from '../theme/ThemeContext';
import { Shape } from '../theme/CupertinoTheme';
import { useDevice } from '../store/DeviceStore';
import { useFolders, AppFolder } from '../store/FoldersStore';
import { ResponsiveNavShell } from '../components/ResponsiveNavShell';
import { TABLET_NAV_ITEMS } from '../components/navigation/navItems';
import {
  CupertinoActivityIndicator,
  CupertinoActionSheet,
  NotificationBanner,
  GlassSurface,
  useAlert,
  useWidgetConfig,
  WidgetGallery,
  useWidgetMap,
} from '../components';
import type { BannerNotification } from '../components';
import type { RootStackParamList } from '../navigation/types';
import {
  darkenHex,
  clampWallpaperIndex,
  wallpaperColorFor,
  CUSTOM_WALLPAPER_INDEX,
} from '../utils/wallpapers';
import { withAutoLockSuppressed } from '../utils/permissions';
import { ControlCenterOverlay } from '../components/ControlCenterOverlay';
import { NotificationCenterOverlay } from '../components/NotificationCenterOverlay';
import { SpotlightReveal } from '../components/SpotlightReveal';
import { AppLaunchOverlay } from '../components/AppLaunchOverlay';
import type { LaunchBounds } from '../components/AppLaunchOverlay';
import { zones, gestureConfig, dpPerMsToPtPerSec, springForAppLaunchDuration } from '../utils/gestureConfig';
import { useVelocityBuffer, pushSample, sampledVelocity } from '../utils/gestureVelocity';
import { commitForSpotlight, commitForTodayView } from '../utils/gestureMachine';
import { settle, useGestureReduceMotion } from '../utils/useGestureReduceMotion';
import { launcherIconPress } from '../theme/springPresets';
import { CUPERTINO_PRESS_SCALE } from '../hooks/useCupertinoPress';
import { CupertinoPressable } from '../components/CupertinoPressable';
import { markGridVisible, markWarmStartBegin } from '../utils/perfMetrics';
import type { AppNavigationProp } from '../navigation/types';
import type { SettingsState } from '../store/SettingsStore';
import { hapticImpact, hapticSelection } from '../utils/haptics';
import { computeLauncherGridGeometry } from '../utils/launcherGridGeometry';
import { hiddenPageIndicesForMode, filterVisiblePages } from '../utils/focusPageVisibility';
import { dockOverrideForMode } from '../utils/focusDockOverride';
import { clampWithRubberBand } from '../theme/motion';
import { computeDragTargetIndex, computeEdgeScrollDirection } from '../utils/launcherDrag';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

// #651-B: maps ResponsiveNavShell's nav item ids (TABLET_NAV_ITEMS) to the
// RootStackParamList route each one opens, so picking a sidebar destination
// on regular-width windows navigates to the matching screen.
const NAV_ITEM_TO_ROUTE: Record<string, keyof RootStackParamList> = {
  Home: 'HomeMain',
  Phone: 'Phone',
  Messages: 'Messages',
  Contacts: 'Contacts',
  Settings: 'Settings',
};
// Default geometry (4 cols, scale 1) — dock, folder-overlay icons, and this
// module's own exports intentionally stay pinned to this regardless of the
// user's grid density settings (issue #503). The actual home-screen grid
// derives its live geometry from settings inside LauncherHomeScreen() below
// via `gridGeometry` (computeLauncherGridGeometry(SCREEN_WIDTH, settings.gridColumns, settings.iconSizeScale)).
const GRID_GEOMETRY = computeLauncherGridGeometry(SCREEN_WIDTH);
// Derivados da largura do ecrã (§2) — ver src/utils/launcherGridGeometry.ts.
export const ICON_SIZE = GRID_GEOMETRY.iconSize;
export const GRID_HORIZONTAL_PADDING = GRID_GEOMETRY.horizontalPadding;
export const ICON_RADIUS = GRID_GEOMETRY.iconRadius;
const DOCK_CELL_WIDTH = (SCREEN_WIDTH - 32) / 4; // dock has 16px padding each side
// #501: o dock não tem label por baixo do ícone (ao contrário da grelha), por
// isso a sua altura visual é ICON_SIZE + este padding * 2, nunca um número
// escolhido à parte — a 393dp dá 60 + 18*2 = 96, batendo com a §2 ("Dock:
// altura ≈96") e escalando com o ícone em qualquer outra largura.
export const DOCK_VERTICAL_PADDING = 18;
// §2: "Dock: inset lateral" = 10.
export const DOCK_HORIZONTAL_INSET = 10;
// Home screen widget stack (#654): two cards per row, same 16px side padding
// convention as the dock above, with a 12px gap between the pair.
// Gutter between a widget's edge and the next cell, so two widgets side by side
// do not touch. HOME_WIDGET_ITEM_WIDTH is gone with #935: it was
// `(SCREEN_WIDTH - 32 - gap) / 2` — half the screen for every widget of every
// size, which is precisely why nothing could adapt around one. A widget's width
// now derives from cellWidth * colSpan, so it follows GRID_GEOMETRY (#499/#503).
const HOME_WIDGET_GAP = 12;

// How far past the screen edge the wallpaper layer is oversized (see the
// `{ left: -PARALLAX_OVERHANG, right: -PARALLAX_OVERHANG }` layer style below).
// This is the entire travel budget for the parallax shift, so the shift must be
// derived from it — not from a separate, independently-chosen multiplier — or
// the layer can translate further than it was oversized and expose bare
// background at the screen edge.
export const PARALLAX_OVERHANG = 20;

// Jiggle-mode drag-to-reorder (#761). How close to the pager's left/right
// screen edge a dragged icon must be for the drag to page-scroll to the
// adjacent page — same idea as a file-manager's drag-to-scroll near a list's
// edge.
export const DRAG_EDGE_THRESHOLD_DP = 40;
// Minimum time between two edge-triggered page scrolls for the SAME drag, so
// a finger held still in the edge zone (onUpdate fires on every pixel of
// jitter, not just real movement) doesn't fire scrollTo() dozens of times a
// second.
const EDGE_SCROLL_THROTTLE_MS = 500;

// Maps raw scroll progress (0 = first page, 1 = last page) to a horizontal
// shift bounded by `overhang` in both directions, so the oversized layer never
// reveals its own edge regardless of how many pages there are.
export function computeWallpaperTranslateX(
  scrollX: number,
  maxScrollX: number,
  overhang: number,
): number {
  // A directiva é OBRIGATÓRIA: esta função é chamada de dentro de um
  // useAnimatedStyle, que corre na thread de UI. Sem ela o Reanimated rebenta com
  // "Tried to synchronously call a non-worklet function on the UI thread" e a app
  // não chega sequer a mostrar o ecrã inicial.
  'worklet';
  const progress = Math.min(1, Math.max(0, scrollX / Math.max(1, maxScrollX)));
  return overhang * (1 - 2 * progress);
}

// Rubber-band overscroll da paginação (#489, §3.3).
//
// A `ScrollView` do Android não reporta um offset proporcional ao arrasto para
// além do limite (`View.overScrollBy` limita o desvio a
// `ViewConfiguration.getScaledOverscrollDistance()`, uma constante pequena), por
// isso a resistência elástica não pode vir de `onScroll`. Vem da distância real
// do dedo (`translationX` de um `Gesture.Pan`) convertida pela fórmula pura de
// `src/theme/motion.ts` (#488).
//
// `dimension` é a largura da página (cada página mede exactamente SCREEN_WIDTH),
// o que dá o mesmo limite assimptótico (`dimension / RUBBER_C`) do UIScrollView.
export function computePagerRubberBandOffset(
  translationX: number,
  dimension: number,
): number {
  // Corre dentro de `.onUpdate` / `useAnimatedStyle`, ou seja na thread de UI.
  'worklet';
  return clampWithRubberBand(translationX, 0, 0, dimension);
}

// A tabela de routing dos built-ins mudou para src/utils/builtInAppRoutes.ts
// (#701) para poder ser usada também pela App Library e pelo Spotlight sem
// criar um ciclo de imports (este ficheiro importa AppLibraryScreen). Re-exporta-se
// daqui para não quebrar os consumidores existentes.
export {
  BUILT_IN_APPS,
  BUILT_IN_APP_ANDROID_ALIASES,
  BUILT_IN_DUPLICATE_PACKAGES,
} from '../utils/builtInAppRoutes';
import {
  BUILT_IN_APPS,
  BUILT_IN_DUPLICATE_PACKAGES,
  builtInAppName,
} from '../utils/builtInAppRoutes';
import { computeHomeGridLayout } from '../widgets/homeGridLayout';
import { ALLOWED_WIDGET_SIZES, isOnHomePage, type WidgetInstance, type WidgetSize } from '../widgets/widgetInstances';
import { WIDGET_LABELS, type WidgetType } from '../widgets/TodayWidgets';
import { logger } from '../utils/logger';
import {
  IOS_FACADE_BY_PACKAGE,
  resolveInstalledFacades,
  facadeHiddenPackages,
} from '../utils/iosFacadeApps';

// Icon config for virtual (built-in) apps rendered in dock/grid
export const VIRTUAL_ICON_CONFIG: Record<string, {
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  gradient?: [string, string];
  iconSize?: number;
}> = {
  'com.iostoandroid.phone': { icon: 'call', bg: '#34C759', gradient: ['#65D36E', '#1FB940'], iconSize: 34 },
  'com.iostoandroid.messages': { icon: 'chatbubble-sharp', bg: '#34C759', gradient: ['#65D36E', '#1FB940'], iconSize: 34 },
  'com.iostoandroid.contacts': { icon: 'people', bg: '#FF9500', gradient: ['#FFA733', '#FF8800'], iconSize: 34 },
  'com.iostoandroid.settings': { icon: 'settings-sharp', bg: '#8E8E93', gradient: ['#8E8E93', '#636366'], iconSize: 34 },
  'com.iostoandroid.weather': { icon: 'partly-sunny', bg: '#5AC8FA', gradient: ['#64D2FF', '#30B0C7'], iconSize: 34 },
  'com.iostoandroid.health': { icon: 'heart', bg: '#FF2D55', gradient: ['#FF5C7A', '#FF2D55'], iconSize: 34 },
  'com.iostoandroid.clock': { icon: 'time', bg: '#000000', gradient: ['#1C1C1E', '#000000'], iconSize: 34 },
  'com.iostoandroid.camera': { icon: 'camera', bg: '#8E8E93', gradient: ['#8E8E93', '#636366'], iconSize: 34 },
  'com.iostoandroid.photos': { icon: 'images', bg: '#FF9500', gradient: ['#FFA733', '#FF8800'], iconSize: 34 },
  'com.iostoandroid.calendar': { icon: 'calendar', bg: '#FF3B30', gradient: ['#FF3B30', '#FF2D55'], iconSize: 34 },
  'com.iostoandroid.calculator': { icon: 'calculator', bg: '#1C1C1E', gradient: ['#636366', '#1C1C1E'], iconSize: 34 },
  'com.iostoandroid.notes': { icon: 'document-text', bg: '#FFCC00', gradient: ['#FFD60A', '#FFB300'], iconSize: 32 },
  'com.iostoandroid.reminders': { icon: 'checkmark-circle', bg: '#5E5CE6', gradient: ['#7D7AFF', '#5E5CE6'], iconSize: 32 },
  'com.iostoandroid.shortcuts': { icon: 'flash', bg: '#FF9500', gradient: ['#FFB340', '#FF8800'], iconSize: 32 },
  'com.iostoandroid.mail': { icon: 'mail', bg: '#0A84FF', gradient: ['#409CFF', '#0071E3'], iconSize: 30 },
  'com.iostoandroid.browser': { icon: 'compass', bg: '#007AFF', gradient: ['#409CFF', '#0071E3'], iconSize: 34 },
  'com.iostoandroid.wallet': { icon: 'wallet', bg: '#5856D6', gradient: ['#7D7AFF', '#5856D6'], iconSize: 32 },
  'com.iostoandroid.maps': { icon: 'map', bg: '#34C759', gradient: ['#5BD96B', '#1FA84A'], iconSize: 32 },
  'com.iostoandroid.findmy': { icon: 'locate', bg: '#34C759', gradient: ['#5BD96B', '#1FA84A'], iconSize: 32 },
  'com.iostoandroid.appstore': { icon: 'logo-apple-appstore', bg: '#0A84FF', gradient: ['#409CFF', '#0071E3'], iconSize: 34 },
  // iOS facades over installed Android apps (utils/iosFacadeApps.ts). The glyph
  // and gradient here are only what Tinted mode and any artwork-less fallback
  // use; the icon you normally see comes from APP_ICON_ARTWORK.
  'com.iostoandroid.music': { icon: 'musical-notes', bg: '#FA2E4B', gradient: ['#FB5C74', '#F62C4B'], iconSize: 32 },
  'com.iostoandroid.news': { icon: 'newspaper', bg: '#FF3B30', gradient: ['#FF6961', '#FF3B30'], iconSize: 32 },
  'com.iostoandroid.tv': { icon: 'tv', bg: '#1C1C1E', gradient: ['#3A3A3C', '#0B0B0C'], iconSize: 32 },
  'com.iostoandroid.podcasts': { icon: 'mic', bg: '#8944D6', gradient: ['#C965F4', '#7A34D6'], iconSize: 32 },
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
// HOME button (#508)
// ---------------------------------------------------------------------------

// What Android's re-delivered HOME intent (onNewIntent, singleTask launchMode
// — see plugins/withLauncherIntent.js) must reset once the launcher is
// already in the foreground. Pure and exported so every starting state is
// asserted directly, without mounting the screen or a real ScrollView.
// The App Library is just the last page of this same pager (#434), not a
// separate overlay, so it needs no case of its own: it's isOnFirstPage: false,
// like any other non-first page.
export interface HomePressState {
  isFolderOpen: boolean;
  isOnFirstPage: boolean;
}

export type HomePressAction =
  | 'none'
  | 'closeFolder'
  | 'scrollToFirstPage'
  | 'closeFolderAndScrollToFirstPage';

export function resolveHomePressAction(state: HomePressState): HomePressAction {
  if (state.isFolderOpen && !state.isOnFirstPage) return 'closeFolderAndScrollToFirstPage';
  if (state.isFolderOpen) return 'closeFolder';
  if (!state.isOnFirstPage) return 'scrollToFirstPage';
  return 'none';
}

// ---------------------------------------------------------------------------
// Dynamic Island
// ---------------------------------------------------------------------------

function DynamicIsland({ device, settings, textScale = 1 }: { device: ReturnType<typeof useDevice>; settings: SettingsState; textScale?: number }) {
  const isCharging = device.battery.isCharging;
  const hasDND = settings.focusMode !== 'off';

  if (!isCharging && !hasDND) return null;

  return (
    <View style={styles.dynamicIsland}>
      {isCharging && (
        <>
          <Ionicons name="flash" size={12} color="#34C759" />
          <Text style={[styles.dynamicIslandText, { fontSize: 12 * textScale }]}>
            {Math.round(device.battery.level * 100)}%
          </Text>
        </>
      )}
      {hasDND && (
        <>
          <Ionicons name="moon" size={12} color="#5856D6" />
          <Text style={[styles.dynamicIslandText, { fontSize: 12 * textScale }]}>Focus</Text>
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// How long AppIcon's measure() waits for measureInWindow's callback before
// giving up (no expand animation) — measureInWindow is a real native
// round-trip and, unlike the spring below, has no completion guarantee baked
// into the API, so a launch must never hang on it (§6.3 "cuidados").
const MEASURE_FALLBACK_MS = 50;

// AppIcon hands the caller a *function* to measure its own on-screen bounds,
// rather than measuring eagerly on every press. Built-in routes (Phone,
// Settings, ...) never call it and navigate synchronously exactly as before —
// only a real external-app launch pays for the native round-trip, and only
// once the caller has already decided it needs one (#442 regression: routing
// through a measurement first added a ~50ms tap delay ahead of every
// navigation, built-in or not).
type MeasureBounds = () => Promise<LaunchBounds | undefined>;

// Cell position (#937 — reflow animation), shared by AppIcon and FolderIcon.
// `mounted` guards the first render so a cell never springs in from (0,0),
// and every later left/top change (a widget resize displacing this cell,
// on the SAME page) TRANSITIONS via settle() instead of snapping. Cross-page
// moves are a mount/unmount, not a transition — nothing to animate there,
// matching iOS.
//
// React Native's LayoutAnimation was considered instead of this (it animates
// a layout-affecting state update with no shared values at all), and
// rejected: it is a single global flag on the NEXT commit, not scoped to
// these cells — it would also catch page-count changes, folder-overlay
// opens, jiggle-mode's own layout churn, and every other unrelated layout
// change in the same tree, none of which this issue asks to animate. It
// also has no way to take the project's own spring presets (settle() /
// 'mediumSettle', or the release velocity settle() forwards) — its spring
// preset is a fixed bounciness/speed pair, unrelated to gestureConfig.ts —
// and on Android it needs UIManager.setLayoutAnimationEnabledExperimental,
// itself flaky pre-New-Architecture. Reanimated shared values, already the
// established convention here (#487/#492, HomeWidgetSlot below), animate
// exactly the cells this issue is about and nothing else.
function useCellPosition(left: number, top: number, reduceMotion: boolean) {
  const animLeft = useSharedValue(left);
  const animTop = useSharedValue(top);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      animLeft.value = left;
      animTop.value = top;
      return;
    }
    // eslint-disable-next-line react-hooks/immutability
    animLeft.value = settle(left, 'mediumSettle', reduceMotion);
    // eslint-disable-next-line react-hooks/immutability
    animTop.value = settle(top, 'mediumSettle', reduceMotion);
  }, [left, top, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  return useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: animLeft.value,
    top: animTop.value,
  }));
}

interface AppIconProps {
  app: InstalledApp;
  cellWidth: number;
  onPress: (app: InstalledApp, measure: MeasureBounds) => void;
  onLongPress: (app: InstalledApp) => void;
  isJiggling?: boolean;
  onDelete?: (app: InstalledApp) => void;
  badge?: number;
  textScale?: number;
  /** Icon square side, in dp. Defaults to the fixed 393dp-reference size so
   * dock and folder-overlay call sites (unaffected by grid density, #503)
   * keep their existing look without passing this explicitly. */
  iconSize?: number;
  iconRadius?: number;
  /** Whether the app name renders under the icon (issue #503). #501: the dock
   * reuses AppIcon but has no name label under the icon. */
  showLabel?: boolean;
  /** Tinted Icons (#620): hex colour to render the icon artwork as a
   * monochrome silhouette in, or undefined/null for the normal, untinted
   * icon. Only the icon is affected — `showLabel`'s text is untouched. */
  iconTint?: string | null;
  /** Gloss sheen on built-in (virtual) icons — follows settings.iconGloss. */
  gloss?: boolean;
  /** Flat index of this icon within the current page's item array (#761 —
   * drag-to-reorder needs to know where a drag started to compute the
   * target cell from the gesture's translation). Ignored when isJiggling is
   * false. */
  pageItemIndex?: number;
  /** Index of the page this icon currently renders on (#761 — so an edge
   * scroll during the drag, and the eventual drop, resolve against the
   * right page's item array even if the pager already advanced). */
  pageIndex?: number;
  /** Drag lifecycle (#761, jiggle-mode only). Mirrors onPress/onLongPress:
   * the app is passed as an argument (not captured by closure) so the
   * parent can hand every AppIcon the same useCallback-memoized function
   * (#518) instead of a fresh arrow function per icon per render. */
  onDragStart?: (app: InstalledApp, pageIndex: number, pageItemIndex: number) => void;
  onDragUpdate?: (app: InstalledApp, translationX: number, translationY: number, absoluteX: number) => void;
  onDragEnd?: (app: InstalledApp, translationX: number, translationY: number) => void;
  /** Cell position in dp, home-grid call site only (#937). When set, the icon
   * renders absolutely positioned and TRANSITIONS to a new left/top via
   * settle()/'mediumSettle' instead of snapping — this is what makes a
   * widget resize's reflow (icons displaced to a new cell on the SAME page)
   * animate rather than jump. Dock and folder-overlay call sites never pass
   * these, so they keep their original flex-flow layout untouched. */
  left?: number;
  top?: number;
  /** Required together with left/top — 'off'/no transition when reduceMotion
   * is set, same convention as HomeWidgetSlot. */
  reduceMotion?: boolean;
}

// React.memo (#518): sem isto, cada AppIcon re-executava o corpo da função —
// e voltava a chamar useAnimatedStyle/useSharedValue — sempre que
// LauncherHomeScreen re-renderizava por qualquer motivo, incluindo um
// simples avanço de página (setCurrentPage). `onPress`/`onLongPress`/`onDelete`
// recebem agora `app` como argumento em vez de o capturarem por closure, para
// que o pai possa passar a mesma referência de função (useCallback) a todas
// as instâncias em vez de criar uma arrow function nova por ícone a cada render
// — sem isso o memo não teria qualquer efeito, porque a prop `onPress` nunca
// seria igual à do render anterior.
const AppIcon = React.memo(function AppIcon({
  app,
  cellWidth,
  onPress,
  onLongPress,
  isJiggling,
  onDelete,
  badge,
  textScale = 1,
  iconSize = ICON_SIZE,
  iconRadius = ICON_RADIUS,
  showLabel = true,
  iconTint,
  gloss = true,
  pageItemIndex = 0,
  pageIndex = 0,
  onDragStart,
  onDragUpdate,
  onDragEnd,
  left, top, reduceMotion = false,
}: AppIconProps) {
  const virtualCfg = VIRTUAL_ICON_CONFIG[app.packageName];
  // Label block (margin + text line) measured at the 393dp reference so the
  // default (cols=4, scale=1, labels on) cell height matches the historical
  // fixed 88 exactly: 5 (paddingTop) + 60 (iconSize) + 23 = 88.
  const wrapperHeight = 5 + iconSize + (showLabel ? 23 : 0);
  const iconBoxSize = { width: iconSize, height: iconSize, borderRadius: iconRadius };
  const rotation = useSharedValue(0);
  const pressScale = useSharedValue(1);
  const dragTranslateX = useSharedValue(0);
  const dragTranslateY = useSharedValue(0);
  const iconRef = useRef<View>(null);

  const measureBounds = useCallback<MeasureBounds>(() => new Promise((resolve) => {
    const node = iconRef.current;
    if (!node || typeof node.measureInWindow !== 'function') {
      resolve(undefined);
      return;
    }
    let settled = false;
    const fallback = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(undefined);
    }, MEASURE_FALLBACK_MS);
    node.measureInWindow((x, y, width, height) => {
      if (settled) return;
      settled = true;
      clearTimeout(fallback);
      resolve({ x, y, width, height });
    });
  }), []);

  const handlePress = useCallback(() => {
    onPress(app, measureBounds);
  }, [onPress, app, measureBounds]);

  const handleLongPress = useCallback(() => {
    onLongPress(app);
  }, [onLongPress, app]);

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
      { translateX: dragTranslateX.value },
      { translateY: dragTranslateY.value },
    ],
  }));

  const handlePressIn = useCallback(() => {
    if (isJiggling) return;
    // eslint-disable-next-line react-hooks/immutability
    // §3.2 shared press scale (issue #496). Was an ad hoc 0.85; the icon keeps
    // its own shared value because the press scale is composed with the jiggle
    // rotation in the same animated style.
    pressScale.value = withSpring(CUPERTINO_PRESS_SCALE, launcherIconPress);
    hapticImpact(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [isJiggling, pressScale]);

  const handlePressOut = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability
    pressScale.value = withSpring(1.0, launcherIconPress);
  }, [pressScale]);

  // Drag-to-reorder (#761). Built fresh every render, same convention as the
  // screen-level pan gestures below (panGesture/todayViewGesture) — AppIcon
  // is already React.memo'd, so this only re-runs when this icon's own props
  // change. `.minDistance(10)`: the jiggle "✕" delete button is a nested
  // Pressable rendered inside this same gesture's subtree, and a Pan with no
  // minimum travel would win the responder race on a plain tap and swallow
  // the delete press. 10dp of slack gives RNGH's native responder time to let
  // the child Pressable's own tap-recognition claim a stationary touch first.
  // Home-grid call site only (left/top set) — see useCellPosition above.
  const positionAnimatedStyle = useCellPosition(left ?? 0, top ?? 0, reduceMotion);

  const dragGesture = Gesture.Pan()
    .enabled(!!isJiggling)
    .minDistance(10)
    .onBegin(() => {
      'worklet';
      if (onDragStart) runOnJS(onDragStart)(app, pageIndex, pageItemIndex);
    })
    .onUpdate((e) => {
      'worklet';
      dragTranslateX.value = e.translationX;
      dragTranslateY.value = e.translationY;
      if (onDragUpdate) runOnJS(onDragUpdate)(app, e.translationX, e.translationY, e.absoluteX);
    })
    .onEnd((e) => {
      'worklet';
      if (onDragEnd) runOnJS(onDragEnd)(app, e.translationX, e.translationY);
    })
    .onFinalize(() => {
      'worklet';
      dragTranslateX.value = withSpring(0);
      dragTranslateY.value = withSpring(0);
    });

  const iconTree = (
    <GestureDetector gesture={dragGesture}>
    <Pressable
      ref={iconRef}
      // O `appIconWrapperCompact` (height: ICON_SIZE estático, paddingTop 0)
      // tem de vir ANTES do { height: wrapperHeight } dinâmico: se vier
      // depois, sobrepõe a altura da célula e, com showIconLabels=false +
      // iconSizeScale=1.2, o ícone (maior que ICON_SIZE) transborda para a
      // linha seguinte da grelha. Com a ordem certa, o compact só contribui
      // com o paddingTop 0 e a célula é sempre 5 + iconSize sem label.
      style={[styles.appIconWrapper, !showLabel && styles.appIconWrapperCompact, { width: cellWidth, height: wrapperHeight }]}
      onPress={isJiggling ? undefined : handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onLongPress={handleLongPress}
      accessibilityLabel={`Open ${app.name}`}
      accessibilityRole="button"
    >
      <Animated.View style={animatedStyle}>
        {virtualCfg ? (
          <SystemAppIcon
            testID={`app-icon-box-${app.packageName}`}
            icon={virtualCfg.icon}
            packageName={app.packageName}
            size={iconSize}
            gradient={virtualCfg.gradient}
            bg={virtualCfg.bg}
            gloss={gloss}
            tint={iconTint}
            iconSize={virtualCfg.iconSize ?? Math.round(iconSize * 0.57)}
          />
        ) : app.icon ? (
          <Image
            testID={`app-icon-box-${app.packageName}`}
            source={{ uri: app.icon }}
            style={[styles.appIconImage, iconBoxSize, iconTint ? { tintColor: iconTint } : null]}
            tintColor={iconTint ?? undefined}
            resizeMode="contain"
          />
        ) : (
          <View testID={`app-icon-box-${app.packageName}`} style={[styles.appIconPlaceholder, iconBoxSize]}>
            <Ionicons name="apps" size={28} color="#fff" />
          </View>
        )}
        {badge != null && badge > 0 && (
          <View style={{
            position: 'absolute',
            top: 0,
            right: (cellWidth - iconSize) / 2 - 4,
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
              onDelete?.(app);
            }}
            hitSlop={4}
            accessibilityLabel={`Remove ${app.name}`}
            accessibilityRole="button"
          >
            <Text style={styles.jiggleDeleteX}>✕</Text>
          </Pressable>
        )}
      </Animated.View>
      {showLabel && (
        <Text style={[styles.appIconLabel, { fontSize: 11 * textScale }]} numberOfLines={1} ellipsizeMode="tail">
          {app.name}
        </Text>
      )}
    </Pressable>
    </GestureDetector>
  );

  // Home-grid call site only (left/top set): absolutely positioned so a
  // reflow TRANSITIONS instead of re-flowing instantly. Dock and
  // folder-overlay call sites (no left/top) keep the original flex-item
  // render, untouched.
  if (left == null || top == null) return iconTree;
  return (
    <Animated.View style={[{ width: cellWidth, height: wrapperHeight }, positionAnimatedStyle]}>
      {iconTree}
    </Animated.View>
  );
});

interface PageDotsProps {
  total: number;
  current: number;
  show: boolean;
}

function PageDots({ total, current, show }: PageDotsProps) {
  // iOS «Home Screen & Dock → Show Page Dots»: escondido por setting mesmo
  // quando há paginação, ou quando há só uma página.
  if (total <= 1 || !show) return null;
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

export type GridItem =
  | { type: 'app'; app: InstalledApp }
  | { type: 'folder'; folder: AppFolder }
  | { type: 'empty'; key: string };

/**
 * Lays out the real (non-dock, non-folder, non-built-in-duplicate) home apps
 * by their `homeApps[].position` (#762), instead of just their order in
 * `eligibleApps`. Apps with no `homeApps` entry yet (never explicitly placed)
 * are appended after every recorded position, in their existing order, so
 * today's behaviour for an untouched layout is unchanged.
 *
 * A position only becomes an `'empty'` slot when **no `homeApps` entry claims
 * it at all** — which is exactly what `removeFromHome` leaves behind, and the
 * only real hole there is. That distinction is the whole point of this
 * function: `assignHomePositions` (`AppsStore.tsx`) numbers the FULL app scan,
 * so dock apps, folder members, built-in duplicates (#438) and hidden /
 * library-only apps all own a position while never rendering in the grid.
 * Treating "no eligible app at position i" as a hole invented a blank cell for
 * every one of them — on a clean install, for every user. Those positions are
 * skipped instead: no icon, no empty slot, nothing.
 *
 * The returned array never has trailing empty slots past the last real app —
 * only interior gaps — so a hole can never manifest as a whole extra blank
 * page at the end of the pager (#762 AC).
 */
export function layoutHomeAppsWithGaps(eligibleApps: InstalledApp[], homeApps: HomeApp[]): GridItem[] {
  const eligiblePkgs = new Set(eligibleApps.map(a => a.packageName));
  // Positions owned by an entry that never renders in the grid. They are not
  // holes — they are somebody else's slot.
  const reserved = new Set<number>();
  for (const entry of homeApps) {
    if (!eligiblePkgs.has(entry.packageName)) reserved.add(entry.position);
  }

  const positioned = new Map<number, InstalledApp>();
  const unpositioned: InstalledApp[] = [];
  for (const app of eligibleApps) {
    const entry = homeApps.find(h => h.packageName === app.packageName);
    if (entry && !positioned.has(entry.position)) {
      positioned.set(entry.position, app);
    } else {
      unpositioned.push(app);
    }
  }
  // Appended apps start past EVERY recorded position (not just the eligible
  // ones), so they can never land on a reserved slot and silently swallow it.
  let nextPos = homeApps.reduce(
    (max, h) => Math.max(max, h.position),
    positioned.size > 0 ? Math.max(...positioned.keys()) : -1,
  ) + 1;
  for (const app of unpositioned) {
    positioned.set(nextPos, app);
    nextPos += 1;
  }

  // maxPos is the last position held by a RENDERED app: anything beyond it is
  // reserved-only tail, and padding it would spawn a blank page at the end.
  const maxPos = positioned.size > 0 ? Math.max(...positioned.keys()) : -1;
  const items: GridItem[] = [];
  for (let i = 0; i <= maxPos; i++) {
    const app = positioned.get(i);
    if (app) {
      items.push({ type: 'app', app });
    } else if (!reserved.has(i)) {
      items.push({ type: 'empty', key: `empty-${i}` });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// HomeWidgetSlot — a placed widget's own box on the home grid (#937)
// ---------------------------------------------------------------------------

interface HomeWidgetSlotProps {
  instance: WidgetInstance;
  left: number;
  top: number;
  width: number;
  height: number;
  isJiggling: boolean;
  reduceMotion: boolean;
  onLongPress: (instance: WidgetInstance) => void;
  children: React.ReactNode;
}

// React.memo (#518, same convention as AppIcon/FolderIcon above): a page
// re-render (e.g. paging) must not re-run this component's animated-style
// wiring for every widget on every other page.
const HomeWidgetSlot = React.memo(function HomeWidgetSlot({
  instance,
  left,
  top,
  width,
  height,
  isJiggling,
  reduceMotion,
  onLongPress,
  children,
}: HomeWidgetSlotProps) {
  // Geometry as shared values so a resize — or any other reflow that moves
  // this widget, e.g. an icon added ahead of it pushing it to a new cell —
  // TRANSITIONS instead of snapping, with the same spring presets already
  // established for the rest of the launcher (#487/#492) rather than a
  // bespoke animation. `mounted` guards the very first render: without it the
  // widget would spring in from (0,0)/0x0 the first time it appears.
  const animLeft = useSharedValue(left);
  const animTop = useSharedValue(top);
  const animWidth = useSharedValue(width);
  const animHeight = useSharedValue(height);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      animLeft.value = left;
      animTop.value = top;
      animWidth.value = width;
      animHeight.value = height;
      return;
    }
    // eslint-disable-next-line react-hooks/immutability
    animLeft.value = settle(left, 'mediumSettle', reduceMotion);
    // eslint-disable-next-line react-hooks/immutability
    animTop.value = settle(top, 'mediumSettle', reduceMotion);
    // eslint-disable-next-line react-hooks/immutability
    animWidth.value = settle(width, 'mediumSettle', reduceMotion);
    // eslint-disable-next-line react-hooks/immutability
    animHeight.value = settle(height, 'mediumSettle', reduceMotion);
  }, [left, top, width, height, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  const animatedStyle = useAnimatedStyle(() => ({
    left: animLeft.value,
    top: animTop.value,
    width: animWidth.value,
    height: animHeight.value,
  }));

  const handleLongPress = useCallback(() => {
    onLongPress(instance);
  }, [onLongPress, instance]);

  return (
    <Animated.View
      testID={`launcher-home-widget-${instance.type}`}
      style={[styles.homeWidgetSlot, animatedStyle]}
    >
      {/* Jiggling swallows the widget's own taps (pointerEvents="none") so a
          long press over it can only reach the resize Pressable below —
          without this, tapping a jiggling Battery/Storage/Messages widget
          would still navigate away, same bug #518 fixed for icons via
          `onPress={isJiggling ? undefined : handlePress}`. */}
      <View pointerEvents={isJiggling ? 'none' : 'box-none'} style={StyleSheet.absoluteFill}>
        {children}
      </View>
      {isJiggling && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onLongPress={handleLongPress}
          accessibilityRole="button"
          accessibilityLabel={`Resize ${WIDGET_LABELS[instance.type]} widget`}
        />
      )}
    </Animated.View>
  );
});

// ---------------------------------------------------------------------------
// FolderIcon
// ---------------------------------------------------------------------------

// React.memo (#518): mesma razão que AppIcon acima. `onPress` recebe `folder`
// como argumento em vez de o capturar por closure, para o pai poder passar
// um useCallback estável a todas as instâncias.
const FolderIcon = React.memo(function FolderIcon({
  folder,
  cellWidth,
  apps,
  onPress,
  onLongPress,
  textScale = 1,
  iconSize = ICON_SIZE,
  iconRadius = ICON_RADIUS,
  showLabel = true,
  iconTint,
  left = 0,
  top = 0,
  reduceMotion = false,
}: {
  folder: AppFolder;
  cellWidth: number;
  apps: InstalledApp[];
  onPress: (folder: AppFolder) => void;
  onLongPress: () => void;
  textScale?: number;
  iconSize?: number;
  iconRadius?: number;
  showLabel?: boolean;
  iconTint?: string | null;
  // Cell position (#937).
  left?: number;
  top?: number;
  reduceMotion?: boolean;
}) {
  const folderApps = folder.apps
    .map(pkg => apps.find(a => a.packageName === pkg))
    .filter(Boolean)
    .slice(0, 9) as InstalledApp[];

  const handlePress = useCallback(() => {
    onPress(folder);
  }, [onPress, folder]);

  const wrapperHeight = 5 + iconSize + (showLabel ? 23 : 0);
  // Mini-icons scale with the folder icon so they never overflow it — the
  // folder box itself always equals iconSize (issue #503: more grid columns
  // shrink the cell, and a fixed 60dp folder icon would then overlap the
  // next column).
  const miniSize = Math.max(6, Math.round(iconSize * (14 / 60)));
  const miniRadius = Math.max(1, Math.round(miniSize * (3 / 14)));
  const positionAnimatedStyle = useCellPosition(left, top, reduceMotion);

  return (
    <Animated.View style={[{ width: cellWidth, height: wrapperHeight }, positionAnimatedStyle]}>
    <CupertinoPressable
      style={[styles.appIconWrapper, { width: cellWidth, height: wrapperHeight }]}
      onPress={handlePress}
      onLongPress={onLongPress}
      accessibilityLabel={`Open ${folder.name} folder`}
      accessibilityRole="button"
    >
      <View
        testID={`folder-icon-box-${folder.id}`}
        style={[
          styles.folderIcon,
          { width: iconSize, height: iconSize, borderRadius: iconRadius, backgroundColor: folder.color },
        ]}
      >
        <View style={styles.folderGrid}>
          {folderApps.map((app, i) =>
            app?.icon ? (
              <Image
                key={i}
                testID={`folder-mini-icon-${folder.id}-${i}`}
                source={{ uri: app.icon }}
                style={[styles.folderMiniIcon, { width: miniSize, height: miniSize, borderRadius: miniRadius }, iconTint ? { tintColor: iconTint } : null]}
                tintColor={iconTint ?? undefined}
              />
            ) : (
              <View key={i} style={[styles.folderMiniIcon, { width: miniSize, height: miniSize, borderRadius: miniRadius, backgroundColor: 'rgba(255,255,255,0.3)' }]} />
            )
          )}
        </View>
      </View>
      {showLabel && (
        <Text style={[styles.appIconLabel, { fontSize: 11 * textScale }]} numberOfLines={1}>{folder.name}</Text>
      )}
    </CupertinoPressable>
    </Animated.View>
  );
});

// ---------------------------------------------------------------------------
// FolderOverlay
// ---------------------------------------------------------------------------

function FolderOverlay({ folder, apps, onClose, onLaunchApp, onLongPressApp, onRename, textScale = 1, iconTint }: {
  folder: AppFolder;
  apps: InstalledApp[];
  onClose: () => void;
  onLaunchApp: (app: InstalledApp) => void;
  onLongPressApp: (app: InstalledApp) => void;
  onRename: (newName: string) => void;
  textScale?: number;
  iconTint?: string | null;
}) {
  const { settings } = useSettings();
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
      <Pressable style={styles.folderOverlayBackdrop} onPress={onClose} accessibilityLabel="Dismiss" accessibilityRole="button">
        <Pressable onPress={e => e.stopPropagation()} importantForAccessibility="no">
          <GlassSurface intensity={60} tint="dark" style={styles.folderOverlayCard}>
            {editing ? (
              <TextInput
                style={[styles.folderOverlayTitleInput, { fontSize: 17 * textScale }]}
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
                <Text style={[styles.folderOverlayTitle, { fontSize: 17 * textScale }]}>{folder.name}</Text>
              </Pressable>
            )}
            <View style={styles.folderOverlayGrid}>
              {folderApps.map(app => (
                <AppIcon
                  key={app.packageName}
                  app={app}
                  cellWidth={70}
                  textScale={textScale}
                  iconTint={iconTint}
                  gloss={settings.iconGloss}
                  onPress={() => onLaunchApp(app)}
                  onLongPress={() => onLongPressApp(app)}
                />
              ))}
            </View>
          </GlassSurface>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Fallback for non-Android
// ---------------------------------------------------------------------------

export function NonAndroidFallback() {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const device = useDevice();

  const wallpaper = wallpaperColorFor(settings.wallpaperIndex);
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
          <Ionicons name="battery-half-outline" size={24} color={colors.systemGreen} />
          <Text style={[typography.body, { color: colors.label, marginLeft: 8 }]}>
            Battery
          </Text>
          <Text
            style={[typography.body, { color: colors.secondaryLabel, marginLeft: 'auto' as unknown as number }]}
          >
            {settings.batteryPercentage ? `${Math.round(device.battery.level * 100)}%` : 'Hidden'}
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
  // How far down the first thing in the flow has to start to clear the notch or
  // camera cutout.
  //
  // Android is in immersive mode here (App.tsx hides the system bars), so
  // useSafeAreaInsets() reports 0 on top and the inset alone would put content
  // under the cutout. StatusBar.currentHeight is the fallback, with a floor of
  // 24 for devices that report neither.
  //
  // ONE value, used by whichever element happens to be first: the banner used
  // raw insets.top and the status row used this expression, so the two
  // disagreed about where the top of the screen was.
  const topClearance = Math.max(insets.top, StatusBar.currentHeight ?? 0, 24);
  const navigation = useNavigation<AppNavigationProp>();

  // #651-B: the sidebar shown on regular-width windows (ResponsiveNavShell)
  // selects a destination from TABLET_NAV_ITEMS/NAV_ITEM_TO_ROUTE and pushes
  // the matching route. LauncherHomeScreen only ever renders while "Home" is
  // the active destination — a pushed screen (Phone/Messages/...) covers it
  // full-screen rather than composing beside it — so activeId is always
  // "Home" here; this stays a plain constant (not `useNavigationState`,
  // which every LauncherHomeScreen.*.test.tsx locally mocks
  // `@react-navigation/native` without) on purpose.
  const activeNavId = 'Home';
  const handleNavSelect = useCallback(
    (id: string) => {
      const route = NAV_ITEM_TO_ROUTE[id];
      if (route) {
        navigation.navigate(route as never);
      }
    },
    [navigation],
  );

  const {
    apps,
    nonDockApps,
    dockApps,
    homeApps,
    isLoading,
    launchApp,
    isDefaultLauncher,
    openLauncherSettings,
    addToDock,
    removeFromDock,
    removeFromHome,
    swapHomeApps,
  } = useApps();
  const { settings } = useSettings();
  const device = useDevice();
  const { folders, createFolder, renameFolder, addToFolder, getFolderForApp } = useFolders();
  const { theme: launcherTheme, textScale } = useTheme();
  const colors = launcherTheme.colors;
  const alert = useAlert();

  // Home screen widgets (#654): top of the first page, iOS-style — the same
  // widgetMap/config the Today View sheet reads/writes, so a widget looks and
  // behaves identically whether it's reached by swiping right into Today View
  // or seen directly on the home page.
  const { instances: homeWidgetInstances, loaded: homeWidgetsLoaded, resizeWidget: resizeWidgetInstance } = useWidgetConfig();
  // Content-by-size (#937 AC 8): useWidgetMap renders one node per TYPE, so a
  // per-instance size can only flow into it as "the size of whichever placed
  // instance of this type we pick" — the last one wins for a type with two
  // differently-sized instances on the SAME page. That is an accepted, narrow
  // edge case (documented in the PR): the underlying data for a type (one
  // battery level, one weather reading) is already a single device-wide
  // value shared by every instance of it, so this only affects how much of
  // that shared value a second same-type widget shows, never what it shows.
  const homeWidgetSizes = useMemo(() => {
    const sizes: Partial<Record<WidgetType, WidgetSize>> = {};
    for (const instance of homeWidgetInstances) {
      if (isOnHomePage(instance)) sizes[instance.type] = instance.size;
    }
    return sizes;
  }, [homeWidgetInstances]);
  const homeWidgetMap = useWidgetMap(homeWidgetSizes);

  // Tap to Wake (#608): the HOME-press effect below is registered with deps
  // [openFolder, currentPage] (it must not re-subscribe on every render), so
  // its closure would otherwise capture a stale `settings.tapToWake`. Mirror
  // the latest value into a ref so the handler always reads the live setting.
  const tapToWakeRef = useRef(settings.tapToWake);
  tapToWakeRef.current = settings.tapToWake;

  // Grid density (issue #503): columns/icon-scale reshape the geometry, so
  // they're derived per-render from settings instead of the module-level
  // defaults above (which stay 4 cols / scale 1, for callers — dock, folder
  // overlay, the geometry test module-export check — that intentionally
  // don't follow user density preferences).
  const gridGeometry = useMemo(
    () => computeLauncherGridGeometry(SCREEN_WIDTH, settings.gridColumns, settings.iconSizeScale),
    [settings.gridColumns, settings.iconSizeScale],
  );
  // The cell's height, named once. The same expression was already open-coded in
  // the empty-slot render and in the drag's target math, and #935 needs it a
  // third time to size a widget's rows.
  const cellHeight = 5 + gridGeometry.iconSize + (settings.showIconLabels ? 23 : 0);

  // Tinted Icons (#620): resolved once per render, shared by every AppIcon
  // call site below (grid, dock, folder overlay) so a single setting change
  // stays a single source of truth instead of three copies of the ternary.
  const iconTint = settings.iconTintEnabled ? settings.iconTintColor : undefined;

  // Folder open state
  const [openFolder, setOpenFolder] = useState<AppFolder | null>(null);

  // Notification banner
  const [activeBanner, setActiveBanner] = useState<BannerNotification | null>(null);
  const seenMessageIds = useRef(new Set<string>());
  useEffect(() => {
    const unread = device.messages.filter((m) => !m.isRead);
    const newMessages = unread.filter((m) => !seenMessageIds.current.has(m.id));
    if (newMessages.length > 0) {
      const newest = newMessages[newMessages.length - 1];
      newMessages.forEach((m) => seenMessageIds.current.add(m.id));
      setActiveBanner({
        id: newest.id,
        appName: 'Messages',
        iconName: 'chatbubble',
        iconColor: '#34C759',
        title: newest.address,
        body: newest.body,
        onPress: () => navigation.navigate('Messages'),
      });
    }
  }, [device.messages, navigation]);

  const reduceMotion = useGestureReduceMotion();

  // Icon-expand transition state (#509, §6.3) — set when a non-built-in app is
  // pressed with usable bounds; the overlay itself fires the real launch once
  // its spring settles (see handleExpandComplete), never on a fixed timer.
  const [launchTransition, setLaunchTransition] = useState<{
    app: InstalledApp;
    bounds: LaunchBounds;
    phase: 'expand' | 'collapse';
  } | null>(null);

  // Spring physics for the icon-expand overlay, derived from the user's
  // chosen appLaunchDurationMs (#512 §6.3) — still a spring at any duration.
  const appLaunchSpringConfig = useMemo(
    () => springForAppLaunchDuration(settings.appLaunchDurationMs),
    [settings.appLaunchDurationMs],
  );

  // Fires exactly when the expand spring settles — this is the intent trigger
  // point, not a setTimeout guess (§6.3). A failed launch collapses the
  // overlay back to the icon instead of leaving it stuck full-screen.
  const handleExpandComplete = useCallback(() => {
    const pending = launchTransition;
    if (!pending) return;
    launchApp(pending.app.packageName).then((ok) => {
      if (ok) {
        setLaunchTransition(null);
      } else {
        setLaunchTransition((prev) => (prev ? { ...prev, phase: 'collapse' } : prev));
      }
    });
  }, [launchTransition, launchApp]);

  const handleCollapseComplete = useCallback(() => {
    setLaunchTransition(null);
  }, []);

  // iOS facades (Music/News/TV/Podcasts): which ones have an installed target,
  // and what that target is. Derived from `apps` — the native scan — so an
  // install or uninstall makes a facade appear or disappear on the next refresh
  // rather than leaving a dead icon behind.
  const installedPackages = useMemo(
    () => new Set(apps.map((a) => a.packageName)),
    [apps],
  );
  const installedFacades = useMemo(
    () => resolveInstalledFacades(installedPackages),
    [installedPackages],
  );
  const facadeTargets = useMemo(
    () => Object.fromEntries(installedFacades.map((r) => [r.facade.packageName, r.target])),
    [installedFacades],
  );
  // The Android app a facade fronts is hidden from the grid, so Music appears
  // once (as Music) rather than twice (as Music and as YouTube Music).
  const facadeHidden = useMemo(
    () => facadeHiddenPackages(installedPackages),
    [installedPackages],
  );

  // Unified app press handler — routes built-in apps to internal screens.
  // `measure` is only invoked for a real external-app launch, never for a
  // built-in route or a folder-modal launch (see AppIcon/MeasureBounds) — a
  // built-in route stays exactly as synchronous as it always was.
  const handleAppPress = useCallback((app: InstalledApp, measure?: MeasureBounds) => {
    hapticImpact(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // iOS facade (Music/News/TV/Podcasts): our icon and name, the device's app.
    // Resolved to its Android package here so the rest of the launch path is
    // the ordinary external launch it already knows how to do.
    const facade = IOS_FACADE_BY_PACKAGE[app.packageName];
    if (facade) {
      const target = facadeTargets[app.packageName];
      // No target means the facade should not have been on the grid at all;
      // a no-op beats launching something arbitrary.
      if (target) launchApp(target).catch((e) => logger.error('LauncherHome', 'facade launch failed', e));
      return;
    }
    const internalRoute = BUILT_IN_APPS[app.packageName];
    if (internalRoute) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- BUILT_IN_APPS routes all have undefined params; navigate overloads require params spec
      navigation.navigate(internalRoute as any);
      return;
    }
    // No measure fn (folder icons open inside a Modal — a separate native
    // window that can't host a screen-spanning overlay), reduceMotion, or
    // appLaunchAnimation off: launch immediately, no expand, no measurement
    // round-trip at all.
    //
    // Precedence (#512 §6.3): reduceMotion — the stand-in for the future
    // `motionIntensity: 'off'` (epic #467, not yet in SettingsStore) — always
    // wins and disables the expand regardless of appLaunchAnimation.
    // appLaunchAnimation: false only disables this one animation and leaves
    // everything else reduceMotion also gates untouched. Either condition
    // alone is enough to skip the overlay; both route through launchApp,
    // which is where LauncherModule.kt's Android transition suppression
    // lives (unconditional there), so it is never affected by this choice.
    if (!measure || reduceMotion || !settings.appLaunchAnimation) {
      // .catch, because this is a floating promise on the path a user tap takes.
      // launchApp resolves rather than rejects for every outcome it knows about,
      // so anything arriving here is unexpected — and an unhandled rejection is
      // exactly the kind of thing that is invisible in a release build.
      launchApp(app.packageName).catch((e) => logger.error('LauncherHome', 'launchApp threw', e));
      return;
    }
    measure()
      .then((bounds) => {
        if (bounds) {
          setLaunchTransition({ app, bounds, phase: 'expand' });
        } else {
          return launchApp(app.packageName).then(() => undefined);
        }
      })
      .catch((e) => {
        // measureInWindow is a native round-trip; a throw there must not leave
        // the tap with no outcome at all. Fall back to the plain launch, which
        // is what a failed measurement already does.
        logger.error('LauncherHome', 'measure/launch failed', e);
        launchApp(app.packageName).catch(() => {});
      });
  }, [navigation, launchApp, reduceMotion, settings.appLaunchAnimation, facadeTargets]);

  // Standalone navigation wrappers for runOnJS (can't call navigation.navigate directly from worklet)
  const navigateTo = useCallback((screen: keyof RootStackParamList) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- screen is a valid route key; params are always undefined for launcher nav targets
    navigation.navigate(screen as any);
  }, [navigation]);

  // The App Library is now the last page of this same pager (#434), so
  // reaching it from a gesture means scrolling to the end of the ScrollView,
  // not pushing a stack screen — `scrollToEnd` needs no page-count math and
  // stays correct as apps are added/removed.
  const scrollToLibraryPage = useCallback(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, []);

  // Vertical swipe gesture on the home body:
  //   up   → App Drawer
  //   down → Spotlight (progress tracked into spotlightProgress; navigate on commit)
  // CC and NC top-zone swipes are handled by the respective overlays' own
  // activation zones (44dp top strip), which win over this parent gesture
  // because they are nested children.
  const spotlightProgress = useSharedValue(0);
  const spotlightBuf = useVelocityBuffer();
  const spotlightT = useSharedValue(0);
  const reduceMotionShared = useSharedValue(reduceMotion);
  useEffect(() => {
    reduceMotionShared.value = reduceMotion;
  }, [reduceMotion, reduceMotionShared]);

  // Mirror of `canSpotlight` (computed from React state further below) so
  // worklets can gate the gesture without touching JS state.
  const canSpotlightShared = useSharedValue(true);

  // Rubber-band overscroll das bordas do pager (#489). Dois SharedValues, um por
  // borda: o conteúdo da página activa desloca-se pela curva da §3.3 enquanto o
  // dedo arrasta para fora dos limites, e volta a 0 com mola ao soltar.
  const firstPageOverscrollX = useSharedValue(0);
  const lastPageOverscrollX = useSharedValue(0);

  const firstPageOverscrollStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: firstPageOverscrollX.value }],
  }));
  const lastPageOverscrollStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: lastPageOverscrollX.value }],
  }));


  // Tracks where a pan gesture began (absolute Y) so the *down-swipe →
  // Spotlight* gesture can be suppressed when the finger starts in the top
  // strip — that strip is claimed by the Control Center / Notification Center
  // overlays, and a down-swipe there must open the iOS Notification Center,
  // never the Spotlight frame. React Native Gesture Handler runs a parent
  // (this pan) and a nested child (the CC/NC overlay) *simultaneously* when
  // nothing excludes the other, so without this guard both the Spotlight
  // reveal frame and the Android-style notification panel preview fire at
  // once (issue #687).
  const panStartY = useSharedValue(0);
  // Height of the top strip reserved for CC/NC (mirrors zones().topStripHeight).
  const topStripHeight = gestureConfig.topZoneHeightDp + 20;

  const panGesture = Gesture.Pan()
    .activeOffsetY([-20, 20])
    .onBegin((e) => {
      'worklet';
      panStartY.value = e.absoluteY;
    })
    .onUpdate((e) => {
      'worklet';
      if (!canSpotlightShared.value) return;
      // Suppress the Spotlight reveal when the gesture started in the top strip
      // that belongs to the Control Center / Notification Center overlays.
      if (panStartY.value <= topStripHeight) {
        spotlightProgress.value = 0;
        return;
      }
      if (e.translationY <= 0) {
        spotlightProgress.value = 0;
        return;
      }
      spotlightT.value = Date.now();
      pushSample(spotlightBuf.value, e.translationX, e.translationY, spotlightT.value);
      const dy = e.translationY;
      if (dy < gestureConfig.spotlightRevealDp) {
        spotlightProgress.value = 0;
        return;
      }
      spotlightProgress.value = Math.min(
        1.5,
        (dy - gestureConfig.spotlightRevealDp) / gestureConfig.spotlightCommitDp,
      );
    })
    .onEnd((event) => {
      'worklet';
      const { translationY, velocityY } = event;

      // Up-swipe → App Library (now the last page of this pager, not a
      // separate screen — see scrollToLibraryPage above)
      if (translationY < -60 && velocityY < -200) {
        spotlightProgress.value = settle(0, 'fastSettle', reduceMotionShared.value);
        runOnJS(scrollToLibraryPage)();
        return;
      }

      // Down-swipe → Spotlight (commit check)
      // Suppressed when the gesture started in the top strip (CC/NC zone) so a
      // down-swipe there opens the iOS Notification Center instead (#687).
      if (canSpotlightShared.value && translationY > 0 && panStartY.value > topStripHeight) {
        spotlightT.value = Date.now();
        pushSample(spotlightBuf.value, event.translationX, event.translationY, spotlightT.value);
        const { vy } = sampledVelocity(spotlightBuf.value, spotlightT.value);
        const p = Math.min(1, Math.max(0, spotlightProgress.value));
        const reason = commitForSpotlight({ progress: p, velocity: vy, holdMs: 0 });
        // spotlightProgress is normalized over spotlightCommitDp; convert the
        // dp/ms sample velocity to progress-units/sec.
        const progressVelocity = dpPerMsToPtPerSec(vy) / gestureConfig.spotlightCommitDp;
        if (reason !== 'none') {
          spotlightProgress.value = settle(1, 'mediumSettle', reduceMotionShared.value, progressVelocity);
          runOnJS(navigateTo)('SpotlightSearch');
          return;
        }
        spotlightProgress.value = settle(0, 'fastSettle', reduceMotionShared.value, progressVelocity);
        return;
      }

      spotlightProgress.value = settle(0, 'fastSettle', reduceMotionShared.value);
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
          // Requests every missing category one after another — each native
          // dialog backgrounds the app, so the whole batch must be
          // suppressed or a slow reader gets auto-locked on first launch.
          await withAutoLockSuppressed(() => mod.requestAllPermissions());
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
  // Widget gallery (long-press -> "+"). Widgets were configurable only from the
  // Today View's Edit panel, three levels deep behind a right-swipe; iOS puts
  // this behind the jiggle-mode "+" and that is where people look for it.
  const [widgetGalleryOpen, setWidgetGalleryOpen] = useState(false);

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
    hapticImpact(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    openActionSheet(app);
  }, [isJiggling, openActionSheet]);

  // Widget resize (#937) — long-press a placed widget while jiggling opens a
  // "Small / Medium / Large" menu instead of the app action sheet above; a
  // widget instance isn't an InstalledApp so it needs its own sheet state
  // rather than overloading `actionSheet.app`.
  const [widgetActionSheet, setWidgetActionSheet] = useState<{
    visible: boolean;
    instance: WidgetInstance | null;
  }>({ visible: false, instance: null });

  const closeWidgetActionSheet = useCallback(() => {
    setWidgetActionSheet({ visible: false, instance: null });
  }, []);

  const handleWidgetLongPress = useCallback((instance: WidgetInstance) => {
    if (!isJiggling) return;
    hapticImpact(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setWidgetActionSheet({ visible: true, instance });
  }, [isJiggling]);

  const widgetActionSheetOptions = useMemo(() => {
    const instance = widgetActionSheet.instance;
    if (!instance) return [];
    const sizeLabels: Record<WidgetSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };
    return ALLOWED_WIDGET_SIZES[instance.type].map((size) => ({
      label: size === instance.size ? `${sizeLabels[size]} (current)` : sizeLabels[size],
      onPress: () => {
        closeWidgetActionSheet();
        resizeWidgetInstance(instance.id, size);
      },
    }));
  }, [widgetActionSheet.instance, closeWidgetActionSheet, resizeWidgetInstance]);

  // Stable across renders (#518) — passadas directamente a AppIcon/FolderIcon
  // em vez de uma arrow function nova por ícone a cada render, para que
  // React.memo consiga mesmo evitar o re-render em transições de página.
  const handleDeleteApp = useCallback((app: InstalledApp) => {
    removeFromHome(app.packageName);
    hapticImpact(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [removeFromHome]);

  const handleOpenFolder = useCallback((folder: AppFolder) => {
    hapticImpact(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setOpenFolder(folder);
  }, []);

  const handleFolderLongPress = useCallback(() => {
    hapticImpact(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsJiggling(true);
  }, []);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  // Parallax wallpaper
  const scrollX = useSharedValue(0);
  const maxScrollX = useSharedValue(1);
  const wallpaperAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: computeWallpaperTranslateX(scrollX.value, maxScrollX.value, PARALLAX_OVERHANG) }],
  }));

  // Custom wallpaper URI (loaded from AsyncStorage when wallpaperIndex === 6)
  const [customWallpaperUri, setCustomWallpaperUri] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem('@iostoandroid/custom_wallpaper').then(uri => {
      if (mounted && uri) setCustomWallpaperUri(uri);
    });
    return () => { mounted = false; };
  }, []);

  // Badge counts computed from device data
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const badgeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const unread = device.messages.filter((m: { isRead: boolean }) => !m.isRead).length;
    if (unread > 0) counts['com.iostoandroid.messages'] = unread;
    return counts;
  }, [device.messages]);

  // Spotlight reveal is suppressed when jiggling, folder is open, or action sheet
  // is up.
  //
  // This lives ABOVE the early returns deliberately. It used to sit ~80 lines
  // further down, after the non-Android and loading returns, so on any render that
  // took one of those paths the effect was skipped — React saw a different number
  // of hooks between renders, which is the "Rendered more hooks than during the
  // previous render" crash waiting to happen. eslint's rules-of-hooks was reporting
  // it as an error, correctly.
  const canSpotlight = !isJiggling && !actionSheet.visible && openFolder === null;
  useEffect(() => {
    canSpotlightShared.value = canSpotlight;
  }, [canSpotlight, canSpotlightShared]);

  // HOME button (#508): Android re-delivers the intent via onNewIntent
  // (singleTask) instead of creating a new Activity, but nothing was
  // listening — this reacts to the native "onHomePressed" event (emitted
  // only for CATEGORY_HOME, see plugins/withLauncherIntent.js) the same way
  // pressing HOME resets a real launcher: close whatever's open, land on the
  // first page. Also lives above the early returns, for the same
  // rules-of-hooks reason as canSpotlight above.
  // Warm start (#517): a janela de medição abre quando o launcher volta a
  // primeiro plano — quer por AppState (a Activity foi retomada) quer pela
  // re-entrega do intent HOME — e fecha no próximo layout da grelha
  // (markGridVisible). Não há aqui nenhuma alteração de comportamento: só
  // marcas de tempo.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') markWarmStartBegin();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    return addHomePressedListener(() => {
      markWarmStartBegin();
      // Tap to Wake (#608): when enabled, a tap on the (app-dimmed) screen
      // wakes it. The native HOME intent only arrives while the app is in the
      // foreground — i.e. the screen is dimmed by the app, not powered off by
      // the system — so this is the realistic envelope (documented in the PR).
      if (tapToWakeRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- mirror SettingsStore.syncFromDevice: require() (not await import()) resolves through Jest's moduleNameMapper and is mockable in tests
        const launcher = require('../../modules/launcher-module/src') as { default: LauncherModuleType };
        launcher.default.wakeScreen().catch(() => {});
      }
      const action = resolveHomePressAction({
        isFolderOpen: openFolder !== null,
        isOnFirstPage: currentPage === 0,
      });
      if (action === 'closeFolder' || action === 'closeFolderAndScrollToFirstPage') {
        setOpenFolder(null);
      }
      if (action === 'scrollToFirstPage' || action === 'closeFolderAndScrollToFirstPage') {
        scrollViewRef.current?.scrollTo({ x: 0, animated: true });
      }
    });
  }, [openFolder, currentPage]);

  // Build display items: virtual built-in apps + real apps + folders.
  // Moved ABOVE the early returns deliberately (#503 reviewer follow-up):
  // this useMemo — together with `pages` and the clamp effect below — used to
  // sit after the isLoading return, so on a render that took the loading path
  // the hooks were skipped while on the loaded path they ran. That's a
  // different hook count between renders → "Rendered more hooks than during
  // the previous render". Same house rule as canSpotlight above.
  const gridItems = useMemo((): GridItem[] => {
    const items: GridItem[] = [];
    const appsInFolders = new Set(folders.flatMap(f => f.apps));
    const dockPkgs = new Set(dockApps.map(a => a.packageName));

    // Add virtual built-in apps to the grid (if not in dock)
    // builtInAppName, not the route: `String(name)` here is what put "Browser",
    // "FindMy" and "AppStore" under the icons instead of Safari, Find My and
    // App Store. A navigation route name is not a label.
    const virtualApps: InstalledApp[] = Object.keys(BUILT_IN_APPS).map((pkg) => ({
      name: builtInAppName(pkg),
      packageName: pkg,
      icon: '',
      isSystem: false,
    }));
    for (const vApp of virtualApps) {
      if (!dockPkgs.has(vApp.packageName) && !appsInFolders.has(vApp.packageName)) {
        items.push({ type: 'app', app: vApp });
      }
    }

    // iOS facades over installed Android apps — only those with a resolved
    // target, so a facade never renders as an icon that opens nothing.
    for (const { facade } of installedFacades) {
      if (!dockPkgs.has(facade.packageName) && !appsInFolders.has(facade.packageName)) {
        items.push({
          type: 'app',
          app: { name: facade.name, packageName: facade.packageName, icon: '', isSystem: false },
        });
      }
    }

    // Add folders
    for (const folder of folders) {
      items.push({ type: 'folder', folder });
    }

    // Real installed apps (not in dock, not in folders, and not an Android
    // duplicate of a built-in app — see BUILT_IN_APP_ANDROID_ALIASES / #438)
    // are laid out by homeApps[].position, gaps included (#762) — dock,
    // folders and the virtual built-ins above are untouched by this and stay
    // contiguous.
    //
    // Supersedes the plain position sort that landed in main for #760:
    // layoutHomeAppsWithGaps orders by the same homeApps.position and keeps
    // main's fallback for apps with no recorded position (appended after the
    // highest known position, in scan order), but additionally materialises
    // unclaimed positions as 'empty' slots instead of letting the next app
    // pull up into the hole.
    const eligibleApps = nonDockApps.filter(
      app => !BUILT_IN_DUPLICATE_PACKAGES.has(app.packageName)
        && !facadeHidden.has(app.packageName)
        && !appsInFolders.has(app.packageName),
    );
    items.push(...layoutHomeAppsWithGaps(eligibleApps, homeApps));
    return items;
  }, [nonDockApps, dockApps, folders, homeApps, installedFacades, facadeHidden]);

  // Paginate grid items — memoizado (#518): sem isto, este array era
  // recriado em TODO o render (incluindo o causado por um simples avanço de
  // página via setCurrentPage), o que por si só invalidava qualquer
  // memoização de AppIcon/FolderIcon a jusante — `pages.map` produzia
  // sempre uma árvore de elementos nova, mesmo quando gridItems não mudou.
  // Slicing the same flat, order-stable `gridItems` list at a different chunk
  // size (cols/rows derive from settings, issue #503) re-packs pages
  // without ever reordering an app — there is no per-page stored position to
  // migrate (issue #503).
  // #935: pages come from the packer, not from slicing at a fixed
  // `appsPerPage`. Once a widget occupies cells, "24 per page" stops being
  // true — the count has to come from the page. The packer returns each page's
  // widgets and the cell each icon landed in, and overflows the rest forward.
  const homeLayout = useMemo(
    () =>
      computeHomeGridLayout<GridItem>({
        cols: gridGeometry.cols,
        rows: settings.gridRows,
        // Only what was placed on a home page. The Today View shows every
        // instance; the home grid shows the ones that live here.
        widgets: homeWidgetsLoaded ? homeWidgetInstances.filter(isOnHomePage) : [],
        items: gridItems,
      }),
    [gridGeometry.cols, settings.gridRows, homeWidgetsLoaded, homeWidgetInstances, gridItems],
  );

  /**
   * Each page as a DENSE array of `cols * rows` cells, in row-major order.
   *
   * Dense on purpose. The drag (#761) maps a translation to a target index and
   * back to a cell with `index % cols` / `floor(index / cols)`, so the rendered
   * flow has to keep index and cell in step. A cell a widget covers renders as
   * the same blank `empty` slot #762 already uses for a hole — which also makes
   * a drop there a no-op, matching the existing rule that only a drop onto
   * another app swaps.
   */
  const allPages: GridItem[][] = useMemo(() => {
    const cellCount = Math.max(1, gridGeometry.cols * settings.gridRows);
    return homeLayout.map((page, pageIndex) => {
      const cells: GridItem[] = Array.from({ length: cellCount }, (_, i) => ({
        type: 'empty' as const,
        key: `p${pageIndex}-c${i}`,
      }));

      let lastUsed = -1;
      for (const placed of page.items) {
        const index = placed.row * gridGeometry.cols + placed.col;
        if (index < 0 || index >= cells.length) continue;
        cells[index] = placed.item;
        if (index > lastUsed) lastUsed = index;
      }
      // A widget's cells have to be reserved even with no icon after them,
      // otherwise the blanks it needs are trimmed away and it overlaps nothing.
      for (const w of page.widgets) {
        const last = (w.row + w.rowSpan - 1) * gridGeometry.cols + (w.col + w.colSpan - 1);
        if (last > lastUsed) lastUsed = Math.min(last, cells.length - 1);
      }

      // Trailing blanks are TRIMMED. Without this every page rendered a full
      // cols*rows of cells, so a page holding five apps painted nineteen extra
      // blank slots — a behaviour change of its own, on top of the layout one.
      // Trimmed, a page with no widget produces exactly the array the old
      // `gridItems.slice(...)` produced.
      return cells.slice(0, lastUsed + 1);
    });
  }, [homeLayout, gridGeometry.cols, settings.gridRows]);

  // Focus filters (#618): com um modo de Focus activo, as páginas cujo índice
  // está em `focusPageVisibility[focusMode]` não renderizam. O índice é o da
  // paginação completa (`allPages`), por isso esconder a página 1 não renumera
  // a configuração das restantes. `off` nunca esconde nada.
  const hiddenPageIndices = useMemo(
    () => hiddenPageIndicesForMode(settings.focusPageVisibility, settings.focusMode),
    [settings.focusPageVisibility, settings.focusMode],
  );
  const pages: GridItem[][] = useMemo(
    () => filterVisiblePages(allPages, hiddenPageIndices),
    [allPages, hiddenPageIndices],
  );

  // Focus dock override (#619, filho de #617): com um modo de Focus activo,
  // `focusDockOverride[focusMode]` pode substituir os 4 ícones do dock por
  // outros pacotes. `dockOverrideForMode` já trata 'off', chave ausente e
  // lista vazia como "sem override" (devolve null), por isso o fallback para
  // o `dockApps` normal cobre esses três casos de uma vez. Os package names
  // resolvem contra `apps` (todos os instalados) e o `dockApps` real (cobre
  // apps virtuais já resolvidos, ex.: Phone/Messages, que só existem como
  // InstalledApp dentro do dock persistido) — um package que já não existe em
  // nenhum dos dois é descartado, nunca renderiza um ícone vazio/quebrado.
  const dockOverridePkgs = useMemo(
    () => dockOverrideForMode(settings.focusDockOverride, settings.focusMode),
    [settings.focusDockOverride, settings.focusMode],
  );
  const effectiveDockApps: InstalledApp[] = useMemo(() => {
    if (!dockOverridePkgs) return dockApps;
    const byPackageName = new Map<string, InstalledApp>();
    for (const app of apps) byPackageName.set(app.packageName, app);
    for (const app of dockApps) byPackageName.set(app.packageName, app);
    return dockOverridePkgs
      .map((pkg) => byPackageName.get(pkg))
      .filter((app): app is InstalledApp => !!app);
  }, [dockOverridePkgs, dockApps, apps]);

  // +1 for the App Library page appended at the end
  const totalPages = pages.length + 1;

  // Reviewer follow-up (#503): mudar a densidade (colunas/linhas) encolhe o
  // número de páginas, e `currentPage` só mudava em handleScroll — ficava
  // para além de totalPages, os dots perdiam a página activa e o offset do
  // pager ficava além do conteúdo até ao próximo scroll. Clampar página e
  // offset juntos. Sem apps suficientes para encolher, currentPage (0) <
  // totalPages e o efeito é no-op.
  useEffect(() => {
    if (currentPage >= totalPages) {
      const lastPage = Math.max(0, totalPages - 1);
      setCurrentPage(lastPage);
      scrollViewRef.current?.scrollTo({ x: lastPage * SCREEN_WIDTH, animated: false });
    }
  }, [currentPage, totalPages]);

  // Jiggle-mode drag-to-reorder (#761). A ref, not state: onDragStart/onDragUpdate
  // fire on every pixel of finger movement (via runOnJS from the worklet), and
  // routing that through setState would re-render the whole screen (and every
  // AppIcon under it, defeating the #518 memoization) dozens of times per
  // second for a value nothing renders from.
  const dragOriginRef = useRef<{ app: InstalledApp; pageIndex: number; pageItemIndex: number } | null>(null);
  const lastEdgeScrollAtRef = useRef(0);

  const handleDragStart = useCallback((app: InstalledApp, pageIndex: number, pageItemIndex: number) => {
    dragOriginRef.current = { app, pageIndex, pageItemIndex };
  }, []);

  const handleDragUpdate = useCallback((_app: InstalledApp, _translationX: number, _translationY: number, absoluteX: number) => {
    const origin = dragOriginRef.current;
    if (!origin) return;
    const direction = computeEdgeScrollDirection(absoluteX, SCREEN_WIDTH, DRAG_EDGE_THRESHOLD_DP);
    if (!direction) return;
    if (Date.now() - lastEdgeScrollAtRef.current < EDGE_SCROLL_THROTTLE_MS) return;
    const targetPage = direction === 'prev' ? origin.pageIndex - 1 : origin.pageIndex + 1;
    // totalPages includes the App Library page at the end, which has no
    // homeApps grid to drop into — an edge-scroll during a home-icon drag
    // must never land there.
    if (targetPage < 0 || targetPage >= pages.length) return;
    lastEdgeScrollAtRef.current = Date.now();
    dragOriginRef.current = { ...origin, pageIndex: targetPage };
    setCurrentPage(targetPage);
    scrollViewRef.current?.scrollTo({ x: targetPage * SCREEN_WIDTH, animated: true });
  }, [pages.length]);

  const handleDragEnd = useCallback((app: InstalledApp, translationX: number, translationY: number) => {
    const origin = dragOriginRef.current;
    dragOriginRef.current = null;
    if (!origin) return;
    const pageItems = pages[origin.pageIndex];
    if (!pageItems || pageItems.length === 0) return;
    const targetIndex = computeDragTargetIndex({
      startIndex: origin.pageItemIndex,
      translationX,
      translationY,
      cellWidth: gridGeometry.cellWidth,
      cellHeight,
      cols: gridGeometry.cols,
      itemCount: pageItems.length,
    });
    const targetItem = pageItems[targetIndex];
    // #761 scope: only a drop onto ANOTHER app icon swaps positions. Dropping
    // on an empty cell (holes/compaction) and dropping on a folder are both
    // explicitly out of scope for this issue.
    if (targetItem && targetItem.type === 'app' && targetItem.app.packageName !== app.packageName) {
      swapHomeApps?.(app.packageName, targetItem.app.packageName);
    }
  }, [pages, gridGeometry, cellHeight, swapHomeApps]);

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
  // clampWallpaperIndex saneia settings.wallpaperIndex (lido de AsyncStorage,
  // fonte não confiável — #674): um blob corrompido com índice não-numérico
  // daria WALLPAPERS[NaN] === undefined e faria darkenHex rebentar no render.
  const wallpaperIndex = clampWallpaperIndex(settings.wallpaperIndex);
  const wallpaperColor = wallpaperColorFor(wallpaperIndex);
  const wallpaperDark = darkenHex(wallpaperColor, 0.28);

  const WallpaperContent =
    wallpaperIndex === CUSTOM_WALLPAPER_INDEX && customWallpaperUri ? (
      <ImageBackground
        testID="wallpaper-custom-image"
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

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    scrollX.value = offsetX;
    maxScrollX.value = event.nativeEvent.contentSize.width - event.nativeEvent.layoutMeasurement.width;
    const page = Math.round(offsetX / SCREEN_WIDTH);
    if (page !== currentPage && page >= 0 && page < totalPages) {
      setCurrentPage(page);
      hapticSelection().catch(() => {});
    }
  };

  const handlePageScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollX.value = event.nativeEvent.contentOffset.x;
    maxScrollX.value = event.nativeEvent.contentSize.width - event.nativeEvent.layoutMeasurement.width;
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
        actions.push({ label: 'Add Contact', onPress: () => { closeActionSheet(); navigation.navigate('ContactEdit', {}); } });
        break;
      case 'com.iostoandroid.settings':
        actions.push({ label: 'Wi-Fi', onPress: () => { closeActionSheet(); navigation.navigate('WiFi'); } });
        actions.push({ label: 'Bluetooth', onPress: () => { closeActionSheet(); navigation.navigate('Bluetooth'); } });
        break;
      case 'com.iostoandroid.calendar':
        actions.push({ label: 'New Event', onPress: () => { closeActionSheet(); navigation.navigate('Calendar'); } });
        break;
      case 'com.iostoandroid.clock':
        actions.push({ label: 'New Alarm', onPress: () => { closeActionSheet(); navigation.navigate('Clock'); } });
        break;
      case 'com.iostoandroid.camera':
        actions.push({ label: 'Take Photo', onPress: () => { closeActionSheet(); navigation.navigate('Camera'); } });
        actions.push({ label: 'Record Video', onPress: () => { closeActionSheet(); navigation.navigate('Camera'); } });
        break;
    }
    return actions;
  };

  // App Info alert helper (shows package name)
  const showAppInfo = (app: InstalledApp) => {
    alert(
      app.name,
      `Package: ${app.packageName}\nSystem App: ${app.isSystem ? 'Yes' : 'No'}`,
    );
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
      label: 'Open App',
      onPress: () => { closeActionSheet(); handleAppPress(app); },
    });

    // App Info
    options.push({
      label: 'App Info',
      onPress: () => { closeActionSheet(); showAppInfo(app); },
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
    const isVirtual = !!BUILT_IN_APPS[app.packageName] || !!IOS_FACADE_BY_PACKAGE[app.packageName];
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

  // Borda da última página (App Library) — #489. Direcção/página que nenhum
  // outro gesto reclama: `activeOffsetX([-20, Infinity])` activa só para
  // arrastos para a ESQUERDA, e só na última página, por isso a paginação
  // normal do `ScrollView` fica intacta em todas as outras páginas.
  const lastPageRubberBandGesture = Gesture.Pan()
    .enabled(currentPage === totalPages - 1)
    .activeOffsetX([-20, Infinity])
    .onUpdate((event) => {
      'worklet';
      lastPageOverscrollX.value = computePagerRubberBandOffset(event.translationX, SCREEN_WIDTH);
    })
    .onFinalize(() => {
      'worklet';
      lastPageOverscrollX.value = settle(0, 'fastSettle', reduceMotionShared.value);
    });

  // Right-swipe on the first home page → Today View (#455).
  //
  // TodayViewScreen was registered in RootStackParamList and given a
  // `slide_from_left` transition (TabNavigator.tsx) but nothing in the app
  // ever called `navigate('TodayView')` — the gesture that transition was
  // built for was never wired up. This mirrors the existing vertical
  // panGesture: built fresh every render (not memoized, same as panGesture
  // above) so `.enabled()` always reflects the current page/mode, and
  // `activeOffsetX([-Infinity, 20])` activates only for RIGHTWARD drags —
  // leftward drags are left untouched so paging to the next app page still
  // works.
  const todayViewGesture = Gesture.Pan()
    .enabled(canSpotlight && currentPage === 0)
    .activeOffsetX([-Infinity, 20])
    .onUpdate((event) => {
      'worklet';
      // Resistência elástica na borda esquerda (#489). O gesto não tinha
      // `.onUpdate`: arrastar para a direita na página 0 não dava feedback
      // nenhum durante o arrasto. O deslocamento é sub-linear desde o primeiro
      // pixel e satura em `SCREEN_WIDTH / RUBBER_C`.
      firstPageOverscrollX.value = computePagerRubberBandOffset(event.translationX, SCREEN_WIDTH);
    })
    .onEnd((event) => {
      'worklet';
      const progress = Math.max(0, event.translationX) / gestureConfig.todayViewCommitDp;
      if (commitForTodayView({ progress, velocity: 0, holdMs: 0 }) !== 'none') {
        runOnJS(navigateTo)('TodayView');
      }
    })
    .onFinalize(() => {
      'worklet';
      firstPageOverscrollX.value = settle(0, 'fastSettle', reduceMotionShared.value);
    });

  // Named because three places have to agree on them: the elements themselves,
  // the top-clearance arithmetic, and the fallback spacer.
  const bannerVisible = !isDefaultLauncher && !isJiggling;
  const statusRowVisible = settings.statusBarVisible;

  // "Status Bar Style" (Settings > Display & Brightness) used to drive
  // Android's status bar. The launcher no longer shows that one, so the setting
  // would have become dead here; it drives the launcher's own row instead,
  // which is the only status bar visible on this screen.
  //
  // 'auto' stays white rather than following the theme: what this text sits on
  // is the wallpaper, not the theme background, and a light theme over a dark
  // wallpaper would render it invisible.
  const statusTint = settings.statusBarStyle === 'dark' ? '#000000' : '#FFFFFF';
  const statusTintMuted =
    settings.statusBarStyle === 'dark' ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)';

  return (
    <ResponsiveNavShell
      navItems={TABLET_NAV_ITEMS}
      activeId={activeNavId}
      onSelect={handleNavSelect}
    >
    <GestureDetector gesture={Gesture.Race(panGesture, todayViewGesture, lastPageRubberBandGesture)}>
      <Animated.View style={[styles.root, { overflow: 'hidden' }]}>
        {/* Parallax wallpaper — absolute layer, slightly oversized to allow horizontal shift */}
        <Animated.View
          testID="wallpaper-layer"
          style={[
            StyleSheet.absoluteFillObject,
            { left: -PARALLAX_OVERHANG, right: -PARALLAX_OVERHANG },
            wallpaperAnimStyle,
          ]}
        >
          {WallpaperContent}
        </Animated.View>

        {/* Always hidden. The launcher draws its OWN iOS status row below, so
            showing Android's as well stacked two status bars on top of each
            other — the reported "too much space between the top and where the
            icons start", and the reason it did not go away with the banner.
            App.tsx hides the system bars globally for exactly this reason; this
            screen was the one place that turned them back on.

            `settings.statusBarVisible` now gates the launcher's own row (which
            is what the "Show Status Bar" toggle sits next to in Launcher
            Settings, between "Show Page Dots" and "Show App Names") instead of
            Android's. */}
        <StatusBar translucent backgroundColor="transparent" hidden />

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
      {bannerVisible && (
        <View testID="launcher-default-banner" style={[styles.defaultBanner, { marginTop: topClearance }]}>
          <Text style={[styles.defaultBannerText, { fontSize: 13 * textScale }]}>Set as default launcher</Text>
          <CupertinoPressable
            style={[styles.defaultBannerButton, { backgroundColor: colors.accent }]}
            onPress={openLauncherSettings}
            accessibilityLabel="Set as default launcher"
            accessibilityRole="button"
          >
            <Text style={[styles.defaultBannerButtonText, { fontSize: 12 * textScale }]}>Set Now</Text>
          </CupertinoPressable>
        </View>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Status bar row                                                     */}
      {/* ---------------------------------------------------------------- */}
      {statusRowVisible && (
      <View
        testID="launcher-status-row"
        style={[
          styles.statusRow,
          // Only the FIRST element in the flow pays for the cutout: the banner
          // above already did when it is showing.
          //
          // The old expression keyed off `!isDefaultLauncher` rather than off
          // whether the banner was actually rendered, so in jiggle mode — where
          // the banner is hidden too — the row was left with 4dp and sat inside
          // the cutout.
          { marginTop: (bannerVisible ? 0 : topClearance) + 4 },
        ]}
      >
        <Pressable onPress={() => navigateTo('NotificationCenter')} accessibilityLabel="Open Notification Center" accessibilityRole="button">
          <Text style={[styles.statusTime, { fontSize: 15 * textScale, color: statusTint }]}>{formatTime(now)}</Text>
        </Pressable>
        <Pressable style={styles.statusRight} onPress={() => navigateTo('ControlCenter')} accessibilityLabel="Open Control Center" accessibilityRole="button">
          {settings.focusMode !== 'off' && (
            <Ionicons name="moon" size={14} color={statusTintMuted} style={{ marginRight: 6 }} />
          )}
          {device.network?.isCellular && (
            <Ionicons name="cellular" size={14} color={statusTintMuted} style={{ marginRight: 6 }} />
          )}
          {device.wifi.enabled && (
            <Ionicons name="wifi" size={14} color={statusTintMuted} style={{ marginRight: 6 }} />
          )}
          {settings.batteryPercentage && (
            <View style={styles.batteryPill}>
              {device.battery.isCharging && (
                <Ionicons name="flash" size={12} color={statusTintMuted} />
              )}
              <Ionicons
                name="battery-half-outline"
                size={14}
                color={statusTintMuted}
              />
              <Text style={[styles.batteryText, { fontSize: 11 * textScale, color: statusTint }]}>
                {Math.round(device.battery.level * 100)}%
              </Text>
            </View>
          )}
          {/* Jiggle-mode controls: "+" opens the widget gallery, Done exits.
              Both live in the status bar row, mirroring iOS. */}
          {isJiggling && (
            <Pressable
              style={styles.jiggleAddBtn}
              onPress={() => setWidgetGalleryOpen(true)}
              accessibilityLabel="Add Widget"
              accessibilityRole="button"
              hitSlop={8}
            >
              <Ionicons name="add" size={18} color="#000000" />
            </Pressable>
          )}
          {isJiggling && (
            <Pressable
              style={styles.jiggleDoneBtn}
              onPress={exitJiggle}
              accessibilityLabel="Done"
              accessibilityRole="button"
            >
              <Text style={[styles.jiggleDoneBtnText, { fontSize: 14 * textScale }]}>Done</Text>
            </Pressable>
          )}
        </Pressable>
      </View>
      )}

      {/* With neither the banner nor the status row on screen, nothing else in
          the flow clears the cutout, so the first row of icons would start
          under it. */}
      {!bannerVisible && !statusRowVisible && (
        <View testID="launcher-top-clearance" style={{ height: topClearance }} />
      )}

      {/* Dynamic Island placeholder */}
      <DynamicIsland device={device} settings={settings} textScale={textScale} />

      {/* ---------------------------------------------------------------- */}
      {/* Swipeable app pages                                                */}
      {/* ---------------------------------------------------------------- */}
      <ScrollView
        testID="launcher-pager"
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        decelerationRate={scrollDecelerationValue(settings.scrollDeceleration)}
        showsHorizontalScrollIndicator={false}
        onScroll={handlePageScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleScroll}
        style={styles.pagerContainer}
        contentContainerStyle={styles.pagerContent}
        scrollEnabled={!isJiggling}
      >
        {pages.map((pageItems, pageIndex) => (
          <Animated.View
            key={pageIndex}
            style={[styles.page, { paddingHorizontal: gridGeometry.horizontalPadding }, pageIndex === 0 ? firstPageOverscrollStyle : null]}
          >
            <View
              testID={`launcher-page-grid-${pageIndex}`}
              // #937: the grid is absolutely-positioned per cell now (so a
              // reflow can TRANSITION each icon to its new cell instead of
              // re-flowing instantly — see AppIcon/FolderIcon's animated
              // left/top), which means it no longer sizes itself from its
              // children's flex flow. Height comes from the same row count
              // the old flexWrap auto-height produced: pageItems is already
              // the dense, trimmed cols*rows array (allPages, above), so
              // ceil(length / cols) is exactly the number of rows it drew.
              style={[styles.pageGrid, { height: Math.ceil(pageItems.length / gridGeometry.cols) * cellHeight }]}
              // Cold/warm start (#517) fecham AQUI, no primeiro layout da
              // grelha da primeira página — o primeiro instante em que a
              // grelha está de facto pintada. Medir no mount do ecrã daria um
              // número falso: nesse momento o que se vê é o spinner do ramo
              // `isLoading` acima. markGridVisible() é idempotente para o cold
              // start, por isso re-layouts (rotação, duplo layout) não produzem
              // segundas medições.
              onLayout={pageIndex === 0 ? markGridVisible : undefined}
            >
              {pageItems.map((item, pageItemIndex) => {
                const cellCol = pageItemIndex % gridGeometry.cols;
                const cellRow = Math.floor(pageItemIndex / gridGeometry.cols);
                const cellLeft = cellCol * gridGeometry.cellWidth;
                const cellTop = cellRow * cellHeight;
                if (item.type === 'empty') {
                  // #762: a position with no app renders a blank cell instead
                  // of letting the next app slide up into it — no Pressable,
                  // no accessibility role, nothing tappable here. Static
                  // (unanimated) position: there is nothing visible here to
                  // transition.
                  return (
                    <View
                      key={item.key}
                      testID={`grid-empty-slot-${item.key}`}
                      style={{
                        position: 'absolute',
                        left: cellLeft,
                        top: cellTop,
                        width: gridGeometry.cellWidth,
                        height: cellHeight,
                      }}
                    />
                  );
                }
                if (item.type === 'folder') {
                  return (
                    <FolderIcon
                      key={`folder-${item.folder.id}`}
                      folder={item.folder}
                      cellWidth={gridGeometry.cellWidth}
                      iconSize={gridGeometry.iconSize}
                      iconRadius={gridGeometry.iconRadius}
                      showLabel={settings.showIconLabels}
                      apps={apps}
                      textScale={textScale}
                      iconTint={iconTint}
                      onPress={handleOpenFolder}
                      onLongPress={handleFolderLongPress}
                      left={cellLeft}
                      top={cellTop}
                      reduceMotion={reduceMotion}
                    />
                  );
                }
                return (
                  <AppIcon
                    key={item.app.packageName}
                    app={item.app}
                    cellWidth={gridGeometry.cellWidth}
                    iconSize={gridGeometry.iconSize}
                    iconRadius={gridGeometry.iconRadius}
                    showLabel={settings.showIconLabels}
                    textScale={textScale}
                    iconTint={iconTint}
                    gloss={settings.iconGloss}
                    onPress={handleAppPress}
                    onLongPress={handleLongPress}
                    isJiggling={isJiggling}
                    badge={badgeCounts[item.app.packageName]}
                    onDelete={handleDeleteApp}
                    pageIndex={pageIndex}
                    pageItemIndex={pageItemIndex}
                    onDragStart={handleDragStart}
                    onDragUpdate={handleDragUpdate}
                    onDragEnd={handleDragEnd}
                    left={cellLeft}
                    top={cellTop}
                    reduceMotion={reduceMotion}
                  />
                );
              })}

              {/* Widgets, over the cells they own.
                  Absolute inside this container rather than a row above it: a
                  widget has to occupy grid CELLS for the icons to flow around
                  it, and the blank slots underneath are what reserve them. The
                  width comes from cellWidth * colSpan (plus the same gaps the
                  icons use), so it follows GRID_GEOMETRY (#499/#503) instead of
                  the old HOME_WIDGET_ITEM_WIDTH half-screen constant.

                  The `launcher-home-widgets` / `launcher-home-widget-<type>`
                  testIDs are kept: what changed is the geometry, not what the
                  home screen contains. */}
              {homeWidgetsLoaded && homeLayout[pageIndex]?.widgets.length > 0 && (
                <View testID={`launcher-home-widgets-${pageIndex}`} style={StyleSheet.absoluteFill} pointerEvents="box-none">
                  {homeLayout[pageIndex].widgets.map((placed) => (
                    <HomeWidgetSlot
                      key={placed.id}
                      instance={placed.instance}
                      left={placed.col * gridGeometry.cellWidth}
                      top={placed.row * cellHeight}
                      width={placed.colSpan * gridGeometry.cellWidth - HOME_WIDGET_GAP}
                      height={placed.rowSpan * cellHeight - HOME_WIDGET_GAP}
                      isJiggling={isJiggling}
                      reduceMotion={reduceMotion}
                      onLongPress={handleWidgetLongPress}
                    >
                      {homeWidgetMap[placed.instance.type]}
                    </HomeWidgetSlot>
                  ))}
                </View>
              )}
            </View>
          </Animated.View>
        ))}

        {/* App Library page — the App Library IS the last swipeable page
            (#434), rendered inline via the shared AppLibraryContent instead
            of a tap-through placeholder. */}
        <Animated.View
          key="app-library"
          style={[styles.page, styles.appLibraryPage, lastPageOverscrollStyle]}
        >
          <AppLibraryContent navigation={navigation} />
        </Animated.View>
      </ScrollView>

      {/* ---------------------------------------------------------------- */}
      {/* Page dots + Search label (iOS 16/17 style)                         */}
      {/* ---------------------------------------------------------------- */}
      <PageDots total={totalPages} current={currentPage} show={settings.showPageDots} />
      <Pressable
        style={styles.searchLabel}
        onPress={isJiggling ? exitJiggle : () => navigation.navigate('SpotlightSearch')}
        accessibilityLabel="Search apps"
        accessibilityRole="search"
      >
        <Text style={[styles.searchLabelText, { fontSize: 13 * textScale }]}>{isJiggling ? 'Tap background to exit' : 'Search'}</Text>
      </Pressable>

      {/* ---------------------------------------------------------------- */}
      {/* Dock                                                               */}
      {/* ---------------------------------------------------------------- */}
      <View testID="launcher-dock" style={[styles.dockOuter, { paddingBottom: insets.bottom + 16 }]}>
        <GlassSurface
          intensity={90}
          tint="dark"
          style={styles.dockBlur}
        >
          <View style={styles.dockRow}>
            {effectiveDockApps.slice(0, 4).map((app) => (
              <AppIcon
                key={app.packageName}
                app={app}
                cellWidth={DOCK_CELL_WIDTH}
                textScale={textScale}
                showLabel={false}
                iconTint={iconTint}
                gloss={settings.iconGloss}
                onPress={handleAppPress}
                onLongPress={handleLongPress}
                isJiggling={isJiggling}
                badge={badgeCounts[app.packageName]}
                onDelete={handleDeleteApp}
              />
            ))}
            {/* Fill empty dock slots */}
            {Array.from({ length: Math.max(0, 4 - effectiveDockApps.length) }).map((_, i) => (
              <View key={`empty-${i}`} style={{ width: DOCK_CELL_WIDTH }} />
            ))}
          </View>
        </GlassSurface>
      </View>

      {/* ---------------------------------------------------------------- */}
      {/* Folder overlay                                                     */}
      {/* ---------------------------------------------------------------- */}
      {openFolder && (
        <FolderOverlay
          folder={openFolder}
          apps={apps}
          textScale={textScale}
          iconTint={iconTint}
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

      {/* Widget resize sheet (#937) — long-press a placed widget in jiggle
          mode. Only the sizes ALLOWED_WIDGET_SIZES declares for this widget's
          type are offered (AC 7). */}
      <CupertinoActionSheet
        visible={widgetActionSheet.visible}
        onClose={closeWidgetActionSheet}
        title={widgetActionSheet.instance ? `Resize ${WIDGET_LABELS[widgetActionSheet.instance.type]}` : undefined}
        options={widgetActionSheetOptions}
      />

      {/* Home indicator is rendered globally from App.tsx (HomeIndicator). */}

      {/* ---------------------------------------------------------------- */}
      {/* Spotlight progressive reveal (downward swipe on home)             */}
      {/* ---------------------------------------------------------------- */}
      <SpotlightReveal progress={spotlightProgress} />

      {/* ---------------------------------------------------------------- */}
      {/* Top-zone progressive reveal overlays (CC + NC)                    */}
      {/* ---------------------------------------------------------------- */}
      <ControlCenterOverlay
        zone={zones(SCREEN_WIDTH, SCREEN_HEIGHT).controlCenter}
        onCommit={() => navigateTo('ControlCenter')}
      />
      <NotificationCenterOverlay
        zone={zones(SCREEN_WIDTH, SCREEN_HEIGHT).notificationCenter}
        onCommit={() => navigateTo('NotificationCenter')}
      />

      {/* ---------------------------------------------------------------- */}
      {/* Widget gallery — jiggle mode "+"                                   */}
      {/* ---------------------------------------------------------------- */}
      <WidgetGallery
        visible={widgetGalleryOpen}
        onClose={() => setWidgetGalleryOpen(false)}
        focusPage={currentPage}
        cols={gridGeometry.cols}
        rows={settings.gridRows}
        pages={homeLayout}
      />

      {/* ---------------------------------------------------------------- */}
      {/* Incoming notification banner                                       */}
      {/* ---------------------------------------------------------------- */}
      <NotificationBanner
        notification={activeBanner}
        onDismiss={() => setActiveBanner(null)}
      />

      {/* ---------------------------------------------------------------- */}
      {/* App-icon expand transition (#509, §6.3)                            */}
      {/* ---------------------------------------------------------------- */}
      {launchTransition && (
        <AppLaunchOverlay
          key={launchTransition.app.packageName}
          icon={launchTransition.app.icon}
          bounds={launchTransition.bounds}
          phase={launchTransition.phase}
          onExpandComplete={handleExpandComplete}
          onCollapseComplete={handleCollapseComplete}
          springConfig={appLaunchSpringConfig}
        />
      )}
      </Animated.View>
    </GestureDetector>
    </ResponsiveNavShell>
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

  // A placed home-screen widget's own box (#937) — position/size come from
  // the animated style HomeWidgetSlot drives; this only fixes it `absolute`.
  homeWidgetSlot: {
    position: 'absolute',
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
  // #937: was `{ flexDirection: 'row', flexWrap: 'wrap' }` — pure flow layout,
  // which is exactly why a reflow (a widget resize displacing icons to a new
  // cell) could never animate: flex re-lays-out its children instantly, with
  // no position to spring FROM. Icons/folders now position themselves via an
  // animated left/top (see AppIcon/FolderIcon), so this container only needs
  // to be their positioning root; height is set inline per page (pageItems.map
  // call site) since it depends on how many rows that page's items fill.
  pageGrid: {
    position: 'relative',
  },

  // Home screen widgets (#654)

  // App icons
  appIconWrapper: {
    alignItems: 'center',
    height: 88,
    justifyContent: 'flex-start',
    paddingTop: 5,
  },
  // #501: dock variant (showLabel=false) — no label below the icon, so the
  // wrapper is exactly the icon's own height instead of the grid's 88.
  appIconWrapperCompact: {
    height: ICON_SIZE,
    paddingTop: 0,
  },
  appIconImage: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_RADIUS,
    overflow: 'hidden',
  },
  appIconPlaceholder: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_RADIUS,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIconLabel: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: '500',
    color: '#ffffff',
    textAlign: 'center',
    width: '90%',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },

  // Page dots
  pageDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 9,
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
    backgroundColor: 'rgba(255,255,255,0.30)',
  },

  // Dock
  dockOuter: {
    paddingHorizontal: DOCK_HORIZONTAL_INSET,
  },
  dockBlur: {
    overflow: 'hidden',
    borderRadius: Shape.dock.radius,
    paddingVertical: DOCK_VERTICAL_PADDING,
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
  jiggleAddBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
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

  // App Library page — no horizontal padding: AppLibraryContent lays out its
  // own edge-to-edge search bar/grid exactly like the standalone screen does.
  appLibraryPage: {
    paddingHorizontal: 0,
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

});
