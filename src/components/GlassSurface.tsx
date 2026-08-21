import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { BlurView, BlurTint } from 'expo-blur';
import { useTheme } from '../theme/ThemeContext';
import { useSettings } from '../store/SettingsStore';

export interface GlassSurfaceProps {
  intensity?: number;
  tint?: BlurTint;
  /** Solid-fallback opacity when "reduceTransparency" is on. Defaults to the most opaque tier for legibility. */
  weight?: 'thin' | 'regular' | 'thick';
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Every glass surface in the app (27 BlurView call sites) renders through here so
 * the "Reduce Transparency" accessibility setting has a single choke point instead
 * of 27 independent `if`s that can drift out of sync.
 */
export function GlassSurface({ intensity = 80, tint, weight = 'thick', style, children }: GlassSurfaceProps) {
  const { isDark, glass } = useTheme();
  const { settings } = useSettings();

  if (settings.reduceTransparency) {
    const dark = tint === 'dark' ? true : tint === 'light' ? false : isDark;
    return <View style={[glass[dark ? 'dark' : 'light'][weight], style]}>{children}</View>;
  }

  return (
    <BlurView intensity={intensity} tint={tint} experimentalBlurMethod="dimezisBlurView" style={style}>
      {children}
    </BlurView>
  );
}
