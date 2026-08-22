import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { GlassSurface } from './GlassSurface';
import { useAlert } from './AlertProvider';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  useAssistiveTouch,
  AssistiveAction,
  MenuItemId,
} from '../store/AssistiveTouchStore';
import { useTheme } from '../theme/ThemeContext';
import { CupertinoPressable } from './CupertinoPressable';
import { hapticImpact, hapticNotification, hapticSelection } from '../utils/haptics';
import { useGestureReduceMotion, settle } from '../utils/useGestureReduceMotion';
import { IDLE_DIM_MS } from '../utils/gestureConfig';
import { assistiveTouchSnap, assistiveTouchMenuReveal } from '../theme/springPresets';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SNAP_SPRING = assistiveTouchSnap;

/**
 * Radial-menu popover geometry. Shared by the anchor maths and the grid styles
 * so the cells provably fit: the popover clips its overflow, so a cell size the
 * content box cannot hold silently drops menu items instead of wrapping them
 * into view.
 */
export const MENU_GEOMETRY = {
  /** Popover box side; the menu is square so the ring stays circular. */
  size: 240,
  padding: 10,
  /** Item badge side (icon + label bubble). */
  cellSize: 62,
  /** Ring radius from the popover centre to each item's centre. */
  radius: 78,
  /** Top-level menu capacity, mirrored by the settings screen. */
  maxItems: 6,
} as const;

// ─── Menu item catalog ──────────────────────────────────────────────────────

interface MenuItemDef {
  id: MenuItemId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  action: AssistiveAction;
}

const MENU_CATALOG: Record<MenuItemId, MenuItemDef> = {
  home:             { id: 'home',             label: 'Home',              icon: 'home',                     action: 'home' },
  multitask:        { id: 'multitask',        label: 'App Switcher',      icon: 'copy-outline',             action: 'multitask' },
  notifications:    { id: 'notifications',    label: 'Notification Centre', icon: 'notifications',         action: 'notifications' },
  controlCenter:    { id: 'controlCenter',    label: 'Control Centre',    icon: 'options',                  action: 'controlCenter' },
  spotlight:        { id: 'spotlight',        label: 'Spotlight',         icon: 'search',                   action: 'spotlight' },
  settings:         { id: 'settings',         label: 'Settings',          icon: 'settings-sharp',           action: 'settings' },
  siri:             { id: 'siri',             label: 'Siri',              icon: 'mic',                      action: 'siri' },
  screenshot:       { id: 'screenshot',       label: 'Screenshot',        icon: 'camera-outline',           action: 'screenshot' },
  lock:             { id: 'lock',             label: 'Lock Screen',       icon: 'lock-closed',              action: 'lock' },
  reachability:     { id: 'reachability',     label: 'Reachability',      icon: 'arrow-down',               action: 'reachability' },
  hideTemporarily:  { id: 'hideTemporarily',  label: 'Hide',              icon: 'eye-off',                  action: 'hideTemporarily' },
  camera:           { id: 'camera',           label: 'Camera',            icon: 'camera',                   action: 'camera' },
  flashlight:       { id: 'flashlight',       label: 'Torch',             icon: 'flashlight',               action: 'flashlight' },
  accessibility:    { id: 'accessibility',    label: 'Accessibility',     icon: 'accessibility',            action: 'accessibility' },
  device:           { id: 'device',           label: 'Device',            icon: 'phone-portrait-outline',   action: 'device' },
  custom:           { id: 'custom',           label: 'Custom',            icon: 'star',                     action: 'custom' },
};

// ─── Context-aware menu overrides ───────────────────────────────────────────
// When a specific route is focused, replace the first menu slot with something
// more useful for that context. The original slot is pushed forward.

const CONTEXT_OVERRIDES: Record<string, MenuItemDef | undefined> = {
  Messages:     { id: 'spotlight',  label: 'New Message', icon: 'create-outline',   action: 'spotlight' },
  Conversation: { id: 'spotlight',  label: 'Reply',       icon: 'return-down-back', action: 'spotlight' },
  Camera:       { id: 'screenshot', label: 'Shutter',     icon: 'radio-button-on',  action: 'screenshot' },
  Phone:        { id: 'home',       label: 'Keypad',      icon: 'keypad',           action: 'home' },
  Photos:       { id: 'spotlight',  label: 'Search',      icon: 'search',           action: 'spotlight' },
};

// Routes where the button should auto-hide
const FULLSCREEN_ROUTES = new Set(['Camera', 'CallScreen']);

// ─── Props ──────────────────────────────────────────────────────────────────

interface AssistiveTouchProps {
  navigationRef: NavigationContainerRefWithCurrent<RootStackParamList>;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AssistiveTouch({ navigationRef }: AssistiveTouchProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const reduceMotion = useGestureReduceMotion();
  const reduceMotionShared = useSharedValue(reduceMotion);
  const {
    enabled,
    idleOpacity,
    size,
    position,
    edge,
    singleTapAction,
    doubleTapAction,
    longPressAction,
    menuItems,
    autoHideFullscreen,
    contextAwareMenu,
    reachabilityOnDoubleTap,
    hapticFeedback,
    temporarilyHidden,
    setPosition,
    hideTemporarily,
    reachabilityActive,
    setReachabilityActive,
  } = useAssistiveTouch();
  const alert = useAlert();

  // ── Current route (for context menu + auto-hide) ──────────────────────────
  // Starts undefined: reading getCurrentRoute() before the NavigationContainer
  // has mounted logs React Navigation's "not initialized" console error.
  const [currentRoute, setCurrentRoute] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (navigationRef.isReady()) setCurrentRoute(navigationRef.getCurrentRoute()?.name);
    const unsub = navigationRef.addListener('state', () => {
      setCurrentRoute(navigationRef.getCurrentRoute()?.name);
    });
    return unsub;
  }, [navigationRef]);

  const hiddenForFullscreen = autoHideFullscreen && !!currentRoute && FULLSCREEN_ROUTES.has(currentRoute);
  const visible = enabled && !temporarilyHidden && !hiddenForFullscreen;

  // Sync reduceMotion into shared value so worklets can read it
  useEffect(() => {
    reduceMotionShared.value = reduceMotion;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  // ── Drag position (shared values for smooth dragging) ─────────────────────
  const translateX = useSharedValue(edge === 'right' ? SCREEN_W - size - 8 : 8);
  const translateY = useSharedValue(Math.min(position.y, SCREEN_H - size - insets.bottom - 40));

  // Re-snap to stored edge when edge prop changes (after settings reset)
  useEffect(() => {
    const targetX = edge === 'right' ? SCREEN_W - size - 8 : 8;
    translateX.value = reduceMotion ? targetX : withSpring(targetX, SNAP_SPRING);
    // Shared values are stable refs; reduceMotion and translateX identity don't drive re-runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edge, size, reduceMotion]);

  // ── Idle dim ──────────────────────────────────────────────────────────────
  const opacity = useSharedValue(1);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wake = useCallback(() => {
    opacity.value = withTiming(1, { duration: 150 });
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      opacity.value = withTiming(idleOpacity, { duration: 600 });
    }, IDLE_DIM_MS);
  }, [opacity, idleOpacity]);

  useEffect(() => {
    if (visible) wake();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [visible, wake]);

  // ── Radial menu state ─────────────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const [fullyOpen, setFullyOpen] = useState(false);
  // Timer that mounts the backdrop once the opening animation settles. Owned by
  // the callbacks (not by an effect on `menuOpen`) so a reopen while the close
  // animation is still running re-arms it: the effect version skipped it
  // because `menuOpen` never transitions when the user reopens mid-close, and
  // the backdrop was then gone for the whole session. `closeMenu` clears it so
  // the backdrop cannot flash back on during the closing animation.
  const fullyOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuScale = useSharedValue(0);
  const menuOpacity = useSharedValue(0);

  const openMenu = useCallback(() => {
    if (hapticFeedback) hapticImpact(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setMenuOpen(true);
    setFullyOpen(false);
    if (fullyOpenTimer.current) clearTimeout(fullyOpenTimer.current);
    fullyOpenTimer.current = setTimeout(() => setFullyOpen(true), 150);
    menuScale.value = reduceMotion
      ? withTiming(1, { duration: 150 })
      : withSpring(1, assistiveTouchMenuReveal);
    menuOpacity.value = withTiming(1, { duration: 160 });
    wake();
  }, [menuScale, menuOpacity, wake, hapticFeedback, reduceMotion]);

  const closeMenu = useCallback(() => {
    menuScale.value = withTiming(0, { duration: 150 });
    menuOpacity.value = withTiming(0, { duration: 150 }, (finished) => {
      if (finished) runOnJS(setMenuOpen)(false);
    });
    setFullyOpen(false);
    if (fullyOpenTimer.current) {
      clearTimeout(fullyOpenTimer.current);
      fullyOpenTimer.current = null;
    }
  }, [menuScale, menuOpacity]);

  useEffect(() => {
    return () => {
      if (fullyOpenTimer.current) clearTimeout(fullyOpenTimer.current);
    };
  }, []);

  // ── Action execution ──────────────────────────────────────────────────────
  const navigate = useCallback(
    (route: string) => {
      try {
        navigationRef.navigate(route as never);
      } catch { /* route missing */ }
    },
    [navigationRef],
  );

  const runAction = useCallback(
    async (action: AssistiveAction) => {
      if (hapticFeedback) hapticSelection().catch(() => {});
      if (action !== 'openMenu') closeMenu();
      switch (action) {
        case 'openMenu':
          openMenu();
          break;
        case 'home':
          if (Platform.OS === 'android') {
            try {
              const mod = (await import('../../modules/launcher-module/src')).default;
              const ok = await mod.goHome();
              if (ok) return;
            } catch { /* fall through */ }
          }
          navigate('HomeMain');
          break;
        case 'multitask':        navigate('Multitask'); break;
        case 'notifications':    navigate('NotificationCenter'); break;
        case 'controlCenter':    navigate('ControlCenter'); break;
        case 'spotlight':        navigate('SpotlightSearch'); break;
        case 'settings':         navigate('Settings'); break;
        case 'siri':             navigate('Siri'); break;
        case 'screenshot':
          // No reliable programmatic screenshot API; briefly flash the screen
          // and let the user capture via power+volume. Treat as placeholder.
          hapticNotification(Haptics.NotificationFeedbackType.Success).catch(() => {});
          break;
        case 'lock':             navigate('LockScreen'); break;
        case 'reachability':
          setReachabilityActive(!reachabilityActive);
          break;
        case 'hideTemporarily':
          hideTemporarily(10000);
          break;
        case 'camera':          navigate('Camera'); break;
        case 'accessibility':   navigate('Accessibility'); break;
        case 'flashlight': {
          try {
            const mod = (await import('../../modules/launcher-module/src')).default;
            const on = await mod.isFlashlightOn();
            await mod.setFlashlight(!on);
          } catch { /* torch may be unavailable */ }
          break;
        }
        case 'volumeUp':
        case 'volumeDown': {
          try {
            const mod = (await import('../../modules/launcher-module/src')).default;
            const v = await mod.getVolume();
            const next = action === 'volumeUp' ? Math.min(1, v + 0.1) : Math.max(0, v - 0.1);
            await mod.setVolume(next);
          } catch { /* volume rail unavailable */ }
          break;
        }
        case 'mute': {
          try {
            const mod = (await import('../../modules/launcher-module/src')).default;
            await mod.setVolume(0);
          } catch { /* unavailable */ }
          break;
        }
        case 'device':
          // iOS's Device is a sub-menu. We serve the same actions as a
          // Cupertino alert so a second tap can still commit one of them.
          alert('Device', undefined, [
            { text: 'Lock Screen',   onPress: () => runAction('lock') },
            { text: 'Volume Up',     onPress: () => runAction('volumeUp') },
            { text: 'Volume Down',   onPress: () => runAction('volumeDown') },
            { text: 'Mute',          onPress: () => runAction('mute') },
            { text: 'Torch',         onPress: () => runAction('flashlight') },
            { text: 'Cancel',        style: 'cancel' },
          ]);
          break;
        case 'custom':
          alert('Custom', 'Custom gestures are not supported yet.');
          break;
        case 'none':
        default:
          break;
      }
    },
    // runAction references itself for the device sub-menu; the ref is late-
    // bound so this stays a valid stable useCallback dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openMenu, closeMenu, navigate, reachabilityActive, setReachabilityActive, hideTemporarily, hapticFeedback, alert],
  );

  // ── Drag gesture ──────────────────────────────────────────────────────────
  const dragStart = useSharedValue({ x: 0, y: 0 });

  const persistPosition = useCallback(
    (x: number, y: number) => {
      const snapEdge: 'left' | 'right' = x + size / 2 < SCREEN_W / 2 ? 'left' : 'right';
      setPosition(x, y, snapEdge);
    },
    [setPosition, size],
  );

  const snapHaptic = useCallback(() => {
    if (hapticFeedback) hapticSelection().catch(() => {});
  }, [hapticFeedback]);

  const panGesture = Gesture.Pan()
    .minDistance(4)
    .onBegin(() => {
      'worklet';
      dragStart.value = { x: translateX.value, y: translateY.value };
      runOnJS(wake)();
    })
    .onUpdate((e) => {
      'worklet';
      translateX.value = dragStart.value.x + e.translationX;
      translateY.value = dragStart.value.y + e.translationY;
    })
    .onEnd((e) => {
      'worklet';
      const rm = reduceMotionShared.value;
      // Magnetic snap to nearest horizontal edge
      const snapLeft = 8;
      const snapRight = SCREEN_W - size - 8;
      const center = translateX.value + size / 2;
      const targetX = center < SCREEN_W / 2 ? snapLeft : snapRight;
      // translateX/translateY are literal dp offsets — e.velocityX/velocityY
      // from the gesture handler are already dp/sec, no conversion needed.
      translateX.value = settle(targetX, SNAP_SPRING, rm, e.velocityX);

      // Clamp Y inside safe area
      const minY = insets.top + 8;
      const maxY = SCREEN_H - size - insets.bottom - 40;
      let targetY = translateY.value;
      if (targetY < minY) targetY = minY;
      if (targetY > maxY) targetY = maxY;
      translateY.value = settle(targetY, SNAP_SPRING, rm, e.velocityY);

      runOnJS(persistPosition)(targetX, targetY);
      runOnJS(snapHaptic)();
    });

  // ── Tap gestures (single / double / long) ────────────────────────────────
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250)
    .onEnd((_e, success) => {
      'worklet';
      if (!success) return;
      runOnJS(runAction)(singleTapAction);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd((_e, success) => {
      'worklet';
      if (!success) return;
      const action: AssistiveAction = reachabilityOnDoubleTap ? 'reachability' : doubleTapAction;
      runOnJS(runAction)(action);
    });

  const longPress = Gesture.LongPress()
    .minDuration(500)
    .onStart(() => {
      'worklet';
      runOnJS(runAction)(longPressAction);
    });

  // Priority: double > single (RNGH's Exclusive + requireExternalGestureToFail)
  const tapChord = Gesture.Exclusive(doubleTap, singleTap, longPress);
  const combined = Gesture.Simultaneous(panGesture, tapChord);

  // ── Animated styles ───────────────────────────────────────────────────────
  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
    opacity: opacity.value,
    width: size,
    height: size,
    borderRadius: size / 2,
  }));

  const menuStyle = useAnimatedStyle(() => ({
    opacity: menuOpacity.value,
    transform: [{ scale: menuScale.value }],
  }));

  // ── Menu items (resolved with context-aware overrides) ───────────────────
  const resolvedMenu = useMemo<MenuItemDef[]>(() => {
    const items = menuItems.map((id) => MENU_CATALOG[id]);
    if (contextAwareMenu && currentRoute && CONTEXT_OVERRIDES[currentRoute]) {
      // Prepend the override, drop any pre-existing entry with the same id
      const override = CONTEXT_OVERRIDES[currentRoute] as MenuItemDef;
      const filtered = items.filter((m) => m.id !== override.id);
      return [override, ...filtered].slice(0, MENU_GEOMETRY.maxItems);
    }
    return items.slice(0, MENU_GEOMETRY.maxItems);
  }, [menuItems, contextAwareMenu, currentRoute]);

  if (!visible) return null;

  // ── Render ────────────────────────────────────────────────────────────────
  const isDark = theme.dark;

  return (
    <>
      {/* Radial menu — backdrop + popover. Backdrop is static so tapping
          outside always closes cleanly; only the popover itself animates. */}
      {menuOpen && (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {fullyOpen && (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={closeMenu}
              accessibilityLabel="Close AssistiveTouch menu"
            />
          )}
          <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, menuStyle]}>
            <RadialMenu
              items={resolvedMenu}
              onPick={(item) => runAction(item.action)}
              buttonSize={size}
              anchorX={translateX}
              anchorY={translateY}
              isDark={isDark}
            />
          </Animated.View>
        </View>
      )}

      {/* Floating button */}
      <GestureDetector gesture={combined}>
        <Animated.View
          style={[styles.button, buttonStyle]}
          accessibilityLabel="AssistiveTouch button"
          accessibilityRole="button"
          accessibilityHint="Tap to open the menu. Drag to reposition. Long-press to hide."
        >
          <GlassSurface
            intensity={55}
            tint={isDark ? 'dark' : 'light'}
            style={[styles.buttonBlur, { borderRadius: size / 2 }]}
          >
            <View style={[styles.buttonInner, { backgroundColor: isDark ? 'rgba(40,40,44,0.55)' : 'rgba(255,255,255,0.55)' }]}>
              <View style={[styles.buttonDot, { backgroundColor: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.65)' }]} />
            </View>
          </GlassSurface>
        </Animated.View>
      </GestureDetector>
    </>
  );
}

// ─── Radial menu sub-component ──────────────────────────────────────────────

interface RadialMenuProps {
  items: MenuItemDef[];
  onPick: (item: MenuItemDef) => void;
  buttonSize: number;
  anchorX: SharedValue<number>;
  anchorY: SharedValue<number>;
  isDark: boolean;
}

function RadialMenu({ items, onPick, buttonSize, anchorX, anchorY, isDark }: RadialMenuProps) {
  // iOS AssistiveTouch arranges items around a central point, not in a
  // grid — items sit on a circle so a 6-item menu reads as a hexagon
  // instead of a truncated 2×3 rectangle.
  const anchorStyle = useAnimatedStyle(() => {
    const cx = anchorX.value + buttonSize / 2;
    const cy = anchorY.value + buttonSize / 2;
    const preferLeft = cx > SCREEN_W / 2;
    const pop = MENU_GEOMETRY.size;
    const gap = 14;
    const x = preferLeft ? cx - pop - gap : cx + gap;
    const y = Math.max(40, Math.min(SCREEN_H - pop - 40, cy - pop / 2));
    return { transform: [{ translateX: x }, { translateY: y }] };
  });

  const cellBg = isDark ? 'rgba(60,60,64,0.55)' : 'rgba(255,255,255,0.55)';
  const iconColor = isDark ? '#fff' : '#000';
  const centre = MENU_GEOMETRY.size / 2;
  const N = items.length;

  return (
    <Animated.View style={[styles.menu, anchorStyle]}>
      <GlassSurface
        intensity={70}
        tint={isDark ? 'dark' : 'light'}
        style={styles.menuBlur}
      >
        <View style={styles.menuRing}>
          {items.map((item, i) => {
            // First item at 12 o'clock, then clockwise.
            const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, N);
            const x = centre + MENU_GEOMETRY.radius * Math.cos(angle) - MENU_GEOMETRY.cellSize / 2;
            const y = centre + MENU_GEOMETRY.radius * Math.sin(angle) - MENU_GEOMETRY.cellSize / 2;
            return (
              <CupertinoPressable
                key={item.id}
                style={[
                  styles.menuCell,
                  {
                    backgroundColor: cellBg,
                    left: x,
                    top: y,
                  },
                ]}
                onPress={() => onPick(item)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <Ionicons name={item.icon} size={22} color={iconColor} />
                <Text style={[styles.menuLabel, { color: iconColor }]} numberOfLines={1}>
                  {item.label}
                </Text>
              </CupertinoPressable>
            );
          })}
        </View>
      </GlassSurface>
    </Animated.View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    top: 0,
    left: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
    zIndex: 60,
  },
  buttonBlur: {
    flex: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  buttonDot: {
    width: '55%',
    height: '55%',
    borderRadius: 999,
  },

  menu: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: MENU_GEOMETRY.size,
    height: MENU_GEOMETRY.size,
    borderRadius: MENU_GEOMETRY.size / 2,
    overflow: 'hidden',
    zIndex: 55,
  },
  menuBlur: {
    flex: 1,
  },
  menuRing: {
    flex: 1,
  },
  menuCell: {
    position: 'absolute',
    width: MENU_GEOMETRY.cellSize,
    height: MENU_GEOMETRY.cellSize,
    borderRadius: MENU_GEOMETRY.cellSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  menuLabel: {
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 2,
  },
});
