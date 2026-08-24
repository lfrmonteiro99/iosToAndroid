/**
 * iOS-style system-app icon: a squircle tile with a gradient fill, a subtle
 * top gloss (the "glassy" highlight of real iOS icons), a depth shadow, and a
 * FILLED glyph in the centre — not an outline Ionicons, which looked nothing
 * like iOS.
 *
 * The native squircle (Kotlin) only masks icons extracted from installed Android
 * apps. The launcher's own built-in apps (Phone, Messages, Settings, ...) are
 * drawn here in JS, so they need their own iOS-faithful treatment.
 *
 * Shape: iOS uses a continuous corner ≈ 0.2237 × side (not a plain rounded rect).
 * Gloss: a white→transparent LinearGradient pinned to the top edge, giving the
 * depth iOS icons have without making them look like glass panels.
 * Shadow: a soft drop shadow under the tile, like the depth real iOS icons cast.
 * Tint: when [tint] is set (iOS "Tinted" mode), the tile becomes a solid tint
 * silhouette with a white glyph — works here because the glyph is our own
 * Ionicons (unlike extracted Android icons, which arrive from Kotlin already
 * masked with an opaque background and can't be tinted to a silhouette by
 * React Native's tintColor).
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
  /**
   * Tinted-Icons colour (iOS "Tinted" mode). When set, the tile becomes a solid
   * tint silhouette with a white glyph, overriding gradient/gloss.
   */
  tint?: string | null;
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
  tint,
  testID,
  style,
}: SystemAppIconProps) {
  const radius = size * IOS_SQUIRCLE_RATIO;
  const glyph = iconSize ?? Math.round(size * 0.57);
  const isTinted = typeof tint === 'string' && tint.length > 0;
  const colors = gradient ?? [bg ?? '#8E8E93', bg ?? '#636366'];
  return (
    <View
      testID={testID}
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: radius,
          // Depth shadow — soft, like real iOS icons.
          shadowColor: '#000000',
          shadowOpacity: 0.25,
          shadowRadius: size * 0.12,
          shadowOffset: { width: 0, height: size * 0.03 },
          elevation: Math.max(1, Math.round(size * 0.04)),
        },
        style,
      ]}
    >
      {isTinted ? (
        // Tinted mode: solid tint silhouette + white glyph.
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
      ) : (
        <LinearGradient
          colors={colors}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {/* Gloss: white sheen fading out across the top third of the tile. */}
      {!isTinted && gloss && (
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
        color={isTinted ? '#ffffff' : '#ffffff'}
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
