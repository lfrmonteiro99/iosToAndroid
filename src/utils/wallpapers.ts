export interface NamedWallpaper {
  color: string;
  name: string;
}

export const NAMED_WALLPAPERS: readonly NamedWallpaper[] = [
  { color: '#667eea', name: 'Lavender' },
  { color: '#f093fb', name: 'Pink' },
  { color: '#4facfe', name: 'Sky' },
  { color: '#43e97b', name: 'Green' },
  { color: '#fa709a', name: 'Coral' },
  { color: '#1C1C1E', name: 'Dark' },
];

export const WALLPAPERS: readonly string[] = NAMED_WALLPAPERS.map((w) => w.color);

/** Darken a hex colour by `amount` (0–1) to build a gradient end stop. */
export function darkenHex(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - Math.round(255 * amount));
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(255 * amount));
  const b = Math.max(0, (num & 0xff) - Math.round(255 * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
