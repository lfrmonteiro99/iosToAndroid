/**
 * Which language the assistant listens in, parses and answers in.
 *
 * The assistant was written entirely in English — the recognizer was started
 * with no language extra (so it transcribed in whatever the system speech
 * service defaults to), the parser only matched English verbs, and every reply
 * was a hardcoded English string. On a Portuguese phone that combination means
 * every spoken request lands on "That's not supported yet.", which is what
 * "não consigo falar com ela" was.
 *
 * The device locale is read the same way `LanguageRegionScreen` already reads
 * it, so the app has one answer for what language it is in and no new
 * dependency is added for this.
 */
import { NativeModules, Platform } from 'react-native';

/** The languages the assistant has patterns and replies for. */
export type AssistantLocale = 'pt' | 'en';

export const DEFAULT_LOCALE: AssistantLocale = 'en';

/**
 * The device's BCP-47 tag, e.g. `pt-PT`.
 *
 * Android reports `pt_PT` through I18nManager; the underscore form is not a
 * valid tag for the speech recognizer or for expo-speech, so it is normalised
 * here rather than at each call site.
 */
export function deviceLanguageTag(): string {
  try {
    const raw = Platform.OS === 'android'
      ? NativeModules.I18nManager?.localeIdentifier
      : undefined;
    const tag = typeof raw === 'string' && raw.length > 0
      ? raw
      : Intl.DateTimeFormat().resolvedOptions().locale;
    return String(tag).replace(/_/g, '-');
  } catch {
    return 'en-US';
  }
}

/** The assistant language for a tag — the primary subtag decides. */
export function assistantLocale(tag: string = deviceLanguageTag()): AssistantLocale {
  const primary = String(tag).toLowerCase().split(/[-_]/)[0];
  return primary === 'pt' ? 'pt' : DEFAULT_LOCALE;
}
