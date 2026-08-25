import { AccentColors } from '../theme/CupertinoTheme';

/**
 * Default Tinted Icons colour (issue #620): the light variant of the app's
 * default accent (blue), matching the iOS default when Tinted mode is first
 * turned on before the user picks a colour.
 */
export const DEFAULT_ICON_TINT_COLOR: string = AccentColors.blue.light;

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

/**
 * Clamp a stored/persisted icon-tint colour into a valid 6-digit hex string.
 * `iconTintColor` feeds `Image`'s `tintColor` style prop directly — a
 * corrupted AsyncStorage blob (non-string, malformed hex) would otherwise
 * pass straight through, so it is normalized on read like the other
 * icon-affecting settings above (iconShape, wallpaperIndex, ...).
 */
export function normalizeIconTintColor(value: unknown): string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value) ? value : DEFAULT_ICON_TINT_COLOR;
}
