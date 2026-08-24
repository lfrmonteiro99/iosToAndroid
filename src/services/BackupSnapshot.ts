import AsyncStorage from '@react-native-async-storage/async-storage';
import { validateSnapshot } from './BackupValidation';

// Explicit allow-list derived from SettingsStore.tsx, ThemeContext.tsx, and
// each settings screen that writes its own AsyncStorage keys.
// Intentionally excludes non-settings data: messages, notes, contacts, reminders,
// home layout, Spotlight history, and any future non-settings keys.
// Shared by BackupRestoreScreen (clipboard backup/restore) so the snapshot
// contract can be reused by the cloud-backup path (#126) without duplicating
// this logic.
export const EXPORTABLE_KEYS = [
  // Main settings blob (SettingsStore)
  '@iostoandroid/settings',
  // ThemeContext — display mode, accent colour, high-contrast
  '@iostoandroid/theme_preference',
  '@iostoandroid/accent_color',
  '@iostoandroid/high_contrast',
  // AccessibilityScreen — text scale, bold, reduce motion
  '@iostoandroid/a11y_textscale',
  '@iostoandroid/a11y_bold',
  '@iostoandroid/a11y_reduce_motion',
  // DisplayBrightnessScreen — night shift preference
  '@iostoandroid/night_shift',
  // KeyboardScreen — keyboard preferences
  '@iostoandroid/kbd_autocap',
  '@iostoandroid/kbd_autocorrect',
  '@iostoandroid/kbd_clicks',
  '@iostoandroid/kbd_predictive',
  // CellularScreen — cellular and data-roaming preferences
  '@iostoandroid/cellular_data',
  '@iostoandroid/data_roaming',
  // DateTimeScreen — timezone preference
  '@iostoandroid/timezone',
  // LanguageRegionScreen — locale preferences
  '@iostoandroid/language',
  '@iostoandroid/region',
  // SoundsHapticsScreen — ringtone and text-tone labels
  '@iostoandroid/ringtone',
  '@iostoandroid/text_tone',
  // WallpaperScreen — custom wallpaper URI
  '@iostoandroid/custom_wallpaper',
] as const;

const EXPORTABLE_SET = new Set<string>(EXPORTABLE_KEYS);

export type BackupSnapshot = Record<string, string>;

/**
 * Reads every allow-listed AsyncStorage key via getMany() and returns a
 * Record<string,string> of the present values, skipping null entries.
 * Same behaviour as the former BackupRestoreScreen.handleExport body.
 */
export async function createSnapshot(): Promise<BackupSnapshot> {
  const entries = await AsyncStorage.getMany([...EXPORTABLE_KEYS]);
  const backup: BackupSnapshot = {};
  for (const [k, v] of Object.entries(entries)) {
    if (v !== null) backup[k] = v;
  }
  return backup;
}

/**
 * Applies a previously created snapshot. Validates the parsed backup shape first
 * (rejects non-objects, arrays, null, empty payloads, non-string values, and
 * over-long keys/values) so a corrupt or foreign backup fails cleanly instead of
 * partially overwriting AsyncStorage. Then writes only allow-listed keys via
 * AsyncStorage.setMany.
 *
 * `validateSnapshot` throws InvalidBackupError (a subclass of Error) on rejection,
 * which surfaces to BackupRestoreScreen's existing "Invalid backup data" alert.
 */
export async function applySnapshot(data: unknown): Promise<void> {
  validateSnapshot(data);
  const filtered: BackupSnapshot = {};
  for (const [k, v] of Object.entries(data)) {
    if (EXPORTABLE_SET.has(k)) {
      filtered[k] = v;
    }
  }
  await AsyncStorage.setMany(filtered);
}
