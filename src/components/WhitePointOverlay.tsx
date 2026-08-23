import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSettings } from '../store/SettingsStore';
import { whitePointToOpacity } from '../utils/whitePoint';

/**
 * iOS «Reduce White Point» applied globally.
 *
 * Renders a translucent black overlay pinned over the whole app root. The
 * overlay darkens the brightest colours (the white point) without touching the
 * OS screen brightness — exactly what the iOS setting does. Its opacity is
 * `1 - whitePointLevel`, so a lower level (stronger reduction) → darker overlay.
 *
 * The overlay sits above the content but is `pointerEvents: 'none'`, so it never
 * eats taps meant for the UI underneath. It is only mounted when
 * `reduceWhitePoint` is enabled; otherwise it renders nothing, so there is no
 * dead overlay in the tree when the feature is off.
 */
export function WhitePointOverlay() {
  const { settings } = useSettings();

  if (!settings.reduceWhitePoint) return null;

  const opacity = whitePointToOpacity(settings.whitePointLevel);

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: `rgba(0,0,0,${opacity})` }]}
      testID="white-point-overlay"
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    // Pinned over the entire app root, above every screen.
    zIndex: 9999,
  },
});
