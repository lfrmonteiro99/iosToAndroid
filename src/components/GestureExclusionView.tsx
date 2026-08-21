import React from 'react';
import { Platform, View, type ViewProps } from 'react-native';
import { requireNativeView } from 'expo';

/**
 * Left-edge touch catcher that also reserves its own bounds against the Android
 * system gesture, so the app's swipe-back is not swallowed by the system back
 * gesture before the touch is ever dispatched to the app.
 *
 * Why a native view: `systemGestureExclusionRects` is NOT a React Native `View`
 * prop in react-native 0.81.5 (verified by grep over react-native,
 * react-native-gesture-handler and react-native-screens), so the exclusion can
 * only be requested from a native View — see
 * modules/launcher-module/android/.../SystemGestureExclusionView.kt, which calls
 * `setSystemGestureExclusionRects` on every layout (rotation, split-screen).
 *
 * Known and accepted limitation (ESPECIFICACAO.md §6.4): Android honours only
 * ~200dp of exclusion height per edge and ignores the excess, so the lower part
 * of the left margin stays claimable by the system gesture. Also a no-op below
 * API 29, where the platform API does not exist.
 *
 * On any non-Android platform there is nothing to exclude, so this degrades to a
 * plain `View` with the same props.
 */
const NativeGestureExclusionView =
  Platform.OS === 'android'
    ? requireNativeView<ViewProps>('LauncherModule', 'SystemGestureExclusionView')
    : null;

export function GestureExclusionView(props: ViewProps) {
  if (NativeGestureExclusionView) {
    return <NativeGestureExclusionView {...props} />;
  }
  return <View {...props} />;
}
