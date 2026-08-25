import * as Linking from 'expo-linking';
import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

/**
 * Deep-link configuration for the root NavigationContainer (#785, part of
 * #629). `expo-linking` was installed but never wired up — `app.json`'s
 * `expo.scheme` ("iostoandroid") is the URI scheme registered for prebuilt
 * Android/iOS intent filters; `Linking.createURL('/')` adds the dev-client
 * prefix so links resolve during development too.
 *
 * No screens are exposed as deep-link targets yet — this only wires the
 * mechanism so a future Shortcuts "deep link" primitive (see
 * primitiveDispatcher.ts) has somewhere to land. Without an explicit
 * `config`, React Navigation falls back to matching path segments against
 * screen names.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'iostoandroid://'],
};
