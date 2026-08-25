import type { RootStackParamList } from '../navigation/types';

// Single source of truth for "which packageName opens one of our own screens".
//
// Lived in LauncherHomeScreen.tsx until #701: the home grid resolved a built-in
// package (and its Android duplicate) to an internal route, but the App Library
// and Spotlight only ever called launchApp(). Google Photos is labelled
// "Photos" by the launcher, so tapping "Photos" in the App Library started the
// Google app instead of our photo library. The table can't live in
// LauncherHomeScreen because that file imports AppLibraryScreen (the App
// Library is the pager's last page, #434) — importing it back would be a cycle.

/** Built-in app routing: packageName → navigation screen name. */
export const BUILT_IN_APPS: Record<string, keyof RootStackParamList> = {
  'com.iostoandroid.phone': 'Phone',
  'com.iostoandroid.messages': 'Messages',
  'com.iostoandroid.contacts': 'Contacts',
  'com.iostoandroid.settings': 'Settings',
  'com.iostoandroid.weather': 'Weather',
  'com.iostoandroid.health': 'Health',
  'com.iostoandroid.clock': 'Clock',
  'com.iostoandroid.camera': 'Camera',
  'com.iostoandroid.photos': 'Photos',
  'com.iostoandroid.calendar': 'Calendar',
  'com.iostoandroid.calculator': 'Calculator',
  'com.iostoandroid.notes': 'Notes',
  'com.iostoandroid.reminders': 'Reminders',
  'com.iostoandroid.mail': 'Mail',
  'com.iostoandroid.browser': 'Browser',
  'com.iostoandroid.wallet': 'Wallet',
};

// Known Android packages that duplicate a built-in app (issue #438).
//
// The home screen shows a virtual icon for every entry of BUILT_IN_APPS, which
// opens the internal iOS-style screen. The real Android app that serves the
// same function has a different packageName, so it used to pass through the
// grid filter untouched and render a second icon with the SAME label that
// launched an external app instead — one "Phone" going to the internal screen,
// another going to the Google Dialer.
//
// Product decision (issue #438, option 1): the Android duplicate is hidden from
// the home screen grid. This is an explicit alias list, not a heuristic: dialer
// / messaging package names vary by OEM, so unlisted equivalents are simply not
// deduped rather than being guessed at. The App Library (AppLibraryScreen) is
// unaffected and keeps listing everything that is installed — but since #701 it
// opens our screen for those aliases instead of the Android app.
export const BUILT_IN_APP_ANDROID_ALIASES: Record<string, readonly string[]> = {
  'com.iostoandroid.phone': ['com.google.android.dialer', 'com.android.dialer'],
  'com.iostoandroid.messages': ['com.google.android.apps.messaging', 'com.android.messaging'],
  'com.iostoandroid.contacts': ['com.google.android.contacts', 'com.android.contacts'],
  'com.iostoandroid.settings': ['com.android.settings'],
  'com.iostoandroid.clock': ['com.google.android.deskclock', 'com.android.deskclock'],
  'com.iostoandroid.camera': ['com.google.android.GoogleCamera', 'com.android.camera2'],
  'com.iostoandroid.photos': ['com.google.android.apps.photos'],
  'com.iostoandroid.calendar': ['com.google.android.calendar', 'com.android.calendar'],
  'com.iostoandroid.calculator': ['com.google.android.calculator', 'com.android.calculator2'],
};

/** Flat set of every Android package that duplicates a built-in app. */
export const BUILT_IN_DUPLICATE_PACKAGES: ReadonlySet<string> = new Set(
  Object.values(BUILT_IN_APP_ANDROID_ALIASES).flat(),
);

/** Android alias packageName → the internal route its built-in twin owns. */
const ALIAS_TO_ROUTE: Record<string, keyof RootStackParamList> = Object.fromEntries(
  Object.entries(BUILT_IN_APP_ANDROID_ALIASES).flatMap(([builtIn, aliases]) => {
    const route = BUILT_IN_APPS[builtIn];
    return route ? aliases.map((alias) => [alias, route] as const) : [];
  }),
);

/**
 * The internal screen a packageName must open, or `undefined` when the package
 * is a genuine third-party app that has to be launched externally.
 *
 * Accepts our own virtual packages AND the Android apps listed as their
 * duplicates, so every entry point (home grid, App Library, Spotlight) resolves
 * "Photos" to the same place instead of dropping into the Google app.
 */
export function resolveInternalRoute(
  packageName: string | undefined | null,
): keyof RootStackParamList | undefined {
  if (typeof packageName !== 'string' || packageName === '') return undefined;
  return BUILT_IN_APPS[packageName] ?? ALIAS_TO_ROUTE[packageName];
}
