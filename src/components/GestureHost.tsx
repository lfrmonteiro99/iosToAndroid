import React, { createContext, useContext, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  SharedValue,
} from 'react-native-reanimated';

export type GestureHostMode = 'none' | 'home' | 'switcher';

interface GestureHostContextValue {
  scale: SharedValue<number>;
  radius: SharedValue<number>;
  shadow: SharedValue<number>;       // 0..1
  wallpaperDim: SharedValue<number>; // 0..1, reserved for future switcher visuals
  mode: SharedValue<GestureHostMode>;
}

const GestureHostContext = createContext<GestureHostContextValue | null>(null);

export function useGestureHost(): GestureHostContextValue {
  const ctx = useContext(GestureHostContext);
  if (!ctx) throw new Error('useGestureHost must be used inside <GestureHost>');
  return ctx;
}

/** Returns null outside a provider — HomeIndicator uses this so it is safe
 *  to render in tests/stories without a host wrapping it. */
export function useOptionalGestureHost(): GestureHostContextValue | null {
  return useContext(GestureHostContext);
}

export function GestureHost({ children }: { children: React.ReactNode }) {
  const scale = useSharedValue(1);
  const radius = useSharedValue(0);
  const shadow = useSharedValue(0);
  const wallpaperDim = useSharedValue(0);
  const mode = useSharedValue<GestureHostMode>('none');

  const value = useMemo(
    () => ({ scale, radius, shadow, wallpaperDim, mode }),
    // shared values are stable refs — deps array intentionally empty
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const hostStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    borderRadius: radius.value,
    // iOS-style shadow — soft and large
    shadowOpacity: shadow.value * 0.35,
    shadowRadius: shadow.value * 28,
    shadowOffset: { width: 0, height: shadow.value * 16 },
    shadowColor: '#000',
    // Android elevation — overflow hidden so rounded corners clip children
    overflow: 'hidden',
    elevation: shadow.value * 24,
  }));

  // TODO: wallpaperDim could drive a full-screen overlay here for deeper
  // switcher-mode visuals (e.g. dimming what's visible through the gap at
  // the edges as the host scales down). Skipped for now — wallpaperDim is
  // already written by HomeIndicator and ready to wire up.

  return (
    <GestureHostContext.Provider value={value}>
      <Animated.View style={[styles.host, hostStyle]}>
        {children}
      </Animated.View>
    </GestureHostContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, backgroundColor: 'transparent' },
});
