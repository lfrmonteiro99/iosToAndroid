import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  useAssistiveTouch,
  AssistiveAction,
  MenuItemId,
} from '../store/AssistiveTouchStore';
import { useTheme } from '../theme/ThemeContext';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const IDLE_DIM_MS = 2500;
const SNAP_SPRING = { damping: 18, stiffness: 220 } as const;

// ─── Menu item catalog ──────────────────────────────────────────────────────

interface MenuItemDef {
  id: MenuItemId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  action: AssistiveAction;
}

const MENU_CATALOG: Record<MenuItemId, MenuItemDef> = {
  home:             { id: 'home',             label: 'Home',           icon: 'home',               action: 'home' },
  multitask:        { id: 'multitask',        label: 'App Switcher',   icon: 'copy-outline',       action: 'multitask' },
  notifications:    { id: 'notifications',    label: 'Notifications',  icon: 'notifications',      action: 'notifications' },
  controlCenter:    { id: 'controlCenter',    label: 'Control Centre', icon: 'options',            action: 'controlCenter' },
  spotlight:        { id: 'spotlight',        label: 'Spotlight',      icon: 'search',             action: 'spotlight' },
  settings:         { id: 'settings',         label: 'Settings',       icon: 'settings-sharp',     action: 'settings' },
  siri:             { id: 'siri',             label: 'Siri',           icon: 'mic',                action: 'siri' },
  screenshot:       { id: 'screenshot',       label: 'Screenshot',     icon: 'camera-outline',     action: 'screenshot' },
  lock:             { id: 'lock',             label: 'Lock Screen',    icon: 'lock-closed',        action: 'lock' },
  reachability:     { id: 'reachability',     label: 'Reachability',   icon: 'arrow-down',         action: 'reachability' },
  hideTemporarily:  { id: 'hideTemporarily',  label: 'Hide',           icon: 'eye-off',            action: 'hideTemporarily' },
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigationRef: NavigationContainerRefWithCurrent<any>;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AssistiveTouch({ navigationRef }: AssistiveTouchProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
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

  // ── Current route (for context menu + auto-hide) ──────────────────────────
  const [currentRoute, setCurrentRoute] = useState<string | undefined>(
    () => navigationRef.getCurrentRoute()?.name,
  );
  useEffect(() => {
    const unsub = navigationRef.addListener('state', () => {
      setCurrentRoute(navigationRef.getCurrentRoute()?.name);
    });
    return unsub;
  }, [navigationRef]);

  const hiddenForFullscreen = autoHideFullscreen && !!currentRoute && FULLSCREEN_ROUTES.has(currentRoute);
  const visible = enabled && !temporarilyHidden && !hiddenForFullscreen;

  // ── Drag position (shared values for smooth dragging) ─────────────────────
  const translateX = useSharedValue(edge === 'right' ? SCREEN_W - size - 8 : 8);
  const translateY = useSharedValue(Math.min(position.y, SCREEN_H - size - insets.bottom - 40));

  // Re-snap to stored edge when edge prop changes (after settings reset)
  useEffect(() => {
    translateX.value = withSpring(
      edge === 'right' ? SCREEN_W - size - 8 : 8,
      SNAP_SPRING,
    );
  }, [edge, size, translateX]);

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
  const menuScale = useSharedValue(0);
  const menuOpacity = useSharedValue(0);

  const openMenu = useCallback(() => {
    if (hapticFeedback) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setMenuOpen(true);
    menuScale.value = withSpring(1, { damping: 14, stiffness: 220 });
    menuOpacity.value = withTiming(1, { duration: 160 });
    wake();
  }, [menuScale, menuOpacity, wake, hapticFeedback]);

  const closeMenu = useCallback(() => {
    menuScale.value = withTiming(0, { duration: 150 });
    menuOpacity.value = withTiming(0, { duration: 150 }, (finished) => {
      if (finished) runOnJS(setMenuOpen)(false);
    });
    setFullyOpen(false);
  }, [menuScale, menuOpacity]);

  useEffect(() => {
    if (menuOpen) {
      const t = setTimeout(() => setFullyOpen(true), 150);
      return () => clearTimeout(t);
    }
    setFullyOpen(false);
  }, [menuOpen]);

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
      if (hapticFeedback) Haptics.selectionAsync().catch(() => {});
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
        case 'siri':             navigate('SpotlightSearch'); break; // best-available analogue
        case 'screenshot':
          // No reliable programmatic screenshot API; briefly flash the screen
          // and let the user capture via power+volume. Treat as placeholder.
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          break;
        case 'lock':             navigate('LockScreen'); break;
        case 'reachability':
          setReachabilityActive(!reachabilityActive);
          break;
        case 'hideTemporarily':
          hideTemporarily(10000);
          break;
        case 'none':
        default:
          break;
      }
    },
    [openMenu, closeMenu, navigate, reachabilityActive, setReachabilityActive, hideTemporarily, hapticFeedback],
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
    if (hapticFeedback) Haptics.selectionAsync().catch(() => {});
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
    .onEnd(() => {
      'worklet';
      // Magnetic snap to nearest horizontal edge
      const snapLeft = 8;
      const snapRight = SCREEN_W - size - 8;
      const center = translateX.value + size / 2;
      const targetX = center < SCREEN_W / 2 ? snapLeft : snapRight;
      translateX.value = withSpring(targetX, SNAP_SPRING);

      // Clamp Y inside safe area
      const minY = insets.top + 8;
      const maxY = SCREEN_H - size - insets.bottom - 40;
      let targetY = translateY.value;
      if (targetY < minY) targetY = minY;
      if (targetY > maxY) targetY = maxY;
      translateY.value = withSpring(targetY, SNAP_SPRING);

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
      return [override, ...filtered].slice(0, 6);
    }
    return items.slice(0, 6);
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
          <BlurView
            intensity={55}
            tint={isDark ? 'dark' : 'light'}
            experimentalBlurMethod="dimezisBlurView"
            style={[styles.buttonBlur, { borderRadius: size / 2 }]}
          >
            <View style={[styles.buttonInner, { backgroundColor: isDark ? 'rgba(40,40,44,0.55)' : 'rgba(255,255,255,0.55)' }]}>
              <View style={[styles.buttonDot, { backgroundColor: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.65)' }]} />
            </View>
          </BlurView>
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
  // The menu is a 2x3 grid popover, not a true radial layout — iOS
  // AssistiveTouch uses a grid and it tests better at small scale. We
  // position the popover to the side of the button that has more space.
  const anchorStyle = useAnimatedStyle(() => {
    const cx = anchorX.value + buttonSize / 2;
    const cy = anchorY.value + buttonSize / 2;
    const preferLeft = cx > SCREEN_W / 2;
    const popWidth = 240;
    const popHeight = 200;
    const gap = 14;
    const x = preferLeft ? cx - popWidth - gap : cx + gap;
    const y = Math.max(40, Math.min(SCREEN_H - popHeight - 40, cy - popHeight / 2));
    return { transform: [{ translateX: x }, { translateY: y }] };
  });

  const cellBg = isDark ? 'rgba(60,60,64,0.35)' : 'rgba(255,255,255,0.25)';
  const iconColor = isDark ? '#fff' : '#000';

  return (
    <Animated.View style={[styles.menu, anchorStyle]}>
      <BlurView
        intensity={70}
        tint={isDark ? 'dark' : 'light'}
        experimentalBlurMethod="dimezisBlurView"
        style={styles.menuBlur}
      >
        <View style={styles.menuGrid}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              style={[styles.menuCell, { backgroundColor: cellBg }]}
              onPress={() => onPick(item)}
              android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true }}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <Ionicons name={item.icon} size={22} color={iconColor} />
              <Text style={[styles.menuLabel, { color: iconColor }]} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </BlurView>
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
    width: 240,
    height: 200,
    borderRadius: 20,
    overflow: 'hidden',
    zIndex: 55,
  },
  menuBlur: {
    flex: 1,
    padding: 10,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  menuCell: {
    width: '32%',
    height: 88,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  menuLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
});
