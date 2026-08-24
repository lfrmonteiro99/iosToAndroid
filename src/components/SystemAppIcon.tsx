/**
 * iOS-style system-app icon: a squircle tile with a gradient fill, a subtle
 * top gloss (the "glassy" highlight of real iOS icons), and a FILLED glyph in
 * the centre — not an outline Ionicons, which looked nothing like iOS.
 *
 * The native squircle (Kotlin) only masks icons extracted from installed Android
 * apps. The launcher's own built-in apps (Phone, Messages, Settings, ...) are
 * drawn here in JS, so they need their own iOS-faithful treatment.
 *
 * Shape: iOS uses a continuous corner ≈ 0.2237 × side (not a plain rounded rect).
 * Gloss: a white→transparent LinearGradient pinned to the top edge, giving the
 * depth iOS icons have without making them look like glass panels.
 */
import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export interface SystemAppIconProps {
  /** Ionicons glyph name (filled variant preferred). */
  icon: keyof typeof Ionicons.glyphMap;
  /** Tile side in dp. */
  size: number;
  /** Gradient stops for the tile background (iOS app tint). Falls back to [bg,bg]. */
  gradient?: [string, string];
  /** Solid fallback colour when [gradient] is absent. */
  bg?: string;
  /** Top gloss highlight (the glassy iOS sheen). Default true. */
  gloss?: boolean;
  /** Glyph size in dp (defaults to ~57% of the tile). */
  iconSize?: number;
  /** Forwarded for tests: `app-icon-box-<packageName>`. */
  testID?: string;
  style?: ViewStyle;
}

// iOS continuous-corner ratio (icon corner radius ÷ side).
const IOS_SQUIRCLE_RATIO = 0.2237;

export function SystemAppIcon({
  icon,
  size,
  gradient,
  bg,
  gloss = true,
  iconSize,
  testID,
  style,
}: SystemAppIconProps) {
  const radius = size * IOS_SQUIRCLE_RATIO;
  const glyph = iconSize ?? Math.round(size * 0.57);
  const colors = gradient ?? [bg ?? '#8E8E93', bg ?? '#636366'];
  return (
    <View
      testID={testID}
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: radius },
        style,
      ]}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Gloss: white sheen fading out across the top third of the tile. */}
      {gloss && (
        <LinearGradient
          colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.55 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <Ionicons
        name={icon}
        size={glyph}
        color="#ffffff"
        style={styles.glyph}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    // Filled glyph sits above the gradients.
    zIndex: 1,
  },
});

export default SystemAppIcon;
