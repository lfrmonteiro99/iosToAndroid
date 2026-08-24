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

/**
 * Índice sentinel de wallpaper personalizado (imagem escolhida pelo utilizador).
 * Não indexa WALLPAPERS: `WallpaperScreen` grava 6 e a home mostra o
 * ImageBackground guardado em '@iostoandroid/custom_wallpaper'. O domínio válido
 * de `settings.wallpaperIndex` é portanto [0, 6].
 */
export const CUSTOM_WALLPAPER_INDEX = 6;

/**
 * Normaliza um índice de wallpaper lido de fonte não confiável (AsyncStorage,
 * settings legados de versões antigas). Devolve 0 para NaN / não-numérico /
 * negativo e clampa ao domínio válido [0, CUSTOM_WALLPAPER_INDEX] — 6 é
 * preservado porque é o sentinel de wallpaper personalizado, não um valor fora
 * de gama.
 *
 * Sem isto, um `wallpaperIndex` corrompido (string, NaN, fora de gama) passaria
 * a `WALLPAPERS[Math.min(index, len-1)] === undefined` e `darkenHex(undefined)`
 * rebentava DURANTE O RENDER da home (#674) — ecrã branco em runtime.
 */
export function clampWallpaperIndex(index: unknown): number {
  const n = typeof index === 'number' ? index : Number(index);
  if (Number.isNaN(n)) return 0;
  return Math.min(Math.max(Math.floor(n), 0), CUSTOM_WALLPAPER_INDEX);
}

/**
 * Cor de gradiente a usar para um `wallpaperIndex` qualquer. O sentinel custom
 * (6) não tem cor própria — cai na primeira cor, que só é pintada quando não
 * existe imagem personalizada guardada.
 */
export function wallpaperColorFor(index: unknown): string {
  const i = clampWallpaperIndex(index);
  return (WALLPAPERS[Math.min(i, WALLPAPERS.length - 1)] ?? WALLPAPERS[0]) as string;
}

/** Darken a hex colour by `amount` (0–1) to build a gradient end stop. */
export function darkenHex(hex: string, amount: number): string {
  // Defesa em profundidade: nunca rebenta com input inválido (issue #674).
  // Um `wallpaperColor` undefined/NaN não deve derrubar o render da home.
  const safe = typeof hex === 'string' && hex.length > 0 ? hex : WALLPAPERS[0];
  const clean = safe.startsWith('#') ? safe.slice(1) : safe;
  const num = parseInt(clean, 16);
  const valid = Number.isFinite(num) ? num : 0x667eea; // fallback Lavender
  const r = Math.max(0, (valid >> 16) - Math.round(255 * amount));
  const g = Math.max(0, ((valid >> 8) & 0xff) - Math.round(255 * amount));
  const b = Math.max(0, (valid & 0xff) - Math.round(255 * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
