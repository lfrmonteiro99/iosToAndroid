/**
 * A visual identity per widget type (#963).
 *
 * Why: every widget except Weather rendered on the same dark glass frame with
 * the same white-on-transparent type, so a home page of widgets read as one
 * grey slab — "todos o mesmo rectângulo cinzento", which the widget epic
 * (#932) already named for the OLD grid and which stayed true for the content.
 * On iOS each widget carries its app's colour: Health is white with a red
 * heart, Music is the pink-red gradient, Clock is near-black, Calendar is white
 * with a red weekday.
 *
 * Pure data plus two resolvers, so the palette is testable without mounting a
 * widget, and so contrast can be asserted rather than eyeballed: a light ground
 * needs dark text, and the pairing is what this file exists to keep honest.
 */
import type { WidgetAppearance } from './WidgetCard';
import type { WidgetType } from './TodayWidgets';

/** Which end of the tone scale a ground needs for its text. */
export type WidgetInkTone = 'onDark' | 'onLight';

export interface WidgetPalette {
  /** The card's surface. */
  appearance: WidgetAppearance;
  /** Which text tones stay legible on it. */
  ink: WidgetInkTone;
  /** The one saturated colour the widget's glyph and figures use. */
  accent: string;
}

/**
 * Text tones per ground.
 *
 * `onDark` reproduces the existing WidgetGlassText values exactly, so a widget
 * that keeps the dark ground is unchanged. `onLight` is the iOS label ramp on
 * white: near-black primary, then the two grey secondaries.
 */
export const WIDGET_INK: Record<WidgetInkTone, {
  title: string; primary: string; secondary: string; tertiary: string; track: string;
}> = {
  onDark: {
    title: 'rgba(255,255,255,0.75)',
    primary: '#ffffff',
    secondary: 'rgba(255,255,255,0.55)',
    tertiary: 'rgba(255,255,255,0.4)',
    track: 'rgba(255,255,255,0.15)',
  },
  onLight: {
    title: 'rgba(0,0,0,0.65)',
    primary: '#000000',
    secondary: 'rgba(60,60,67,0.6)',
    tertiary: 'rgba(60,60,67,0.35)',
    track: 'rgba(0,0,0,0.08)',
  },
};

function gradient(from: string, to: string, accent: string, ink: WidgetInkTone = 'onDark'): WidgetPalette {
  return {
    appearance: {
      surface: 'gradient',
      gradientColors: [from, to],
      // Reduce Transparency and the pre-blur frame both fall back to a flat
      // fill; the darker stop is the one that keeps the ink contrast the
      // gradient was chosen for.
      solidColor: { light: to, dark: to },
    },
    ink,
    accent,
  };
}

function solid(light: string, dark: string, accent: string, ink: WidgetInkTone): WidgetPalette {
  return {
    appearance: { surface: 'solid', solidColor: { light, dark } },
    ink,
    accent,
  };
}

/**
 * The identities.
 *
 * Weather is absent on purpose: its ground already comes from the CONDITION
 * (WidgetWeatherGradients), which is more information than a fixed palette
 * would carry, and overriding it here would throw that away.
 */
export const WIDGET_PALETTES: Record<Exclude<WidgetType, 'weather'>, WidgetPalette> = {
  battery: gradient('#2E7D46', '#12331F', '#34C759'),
  storage: gradient('#3B4B63', '#171C24', '#0A84FF'),
  upNext: solid('#FFFFFF', '#1C1C1E', '#FF3B30', 'onLight'),
  messages: gradient('#2E7D46', '#123322', '#34C759'),
  screenTime: gradient('#4B4BA8', '#1B1B3A', '#5E5CE6'),
  // The clock face is near-black on iOS, and the second hand is the one orange
  // element on it.
  clock: gradient('#2A2A2E', '#0A0A0C', '#FF9F0A'),
  // Calendar is white with the weekday in red — the reference the epic quotes.
  calendar: solid('#FFFFFF', '#1C1C1E', '#FF3B30', 'onLight'),
  nowPlaying: gradient('#FB5C74', '#B3123A', '#FFFFFF'),
  // Activity keeps the black ground the rings are drawn on.
  activity: gradient('#1F1F22', '#000000', '#A6FF00'),
  quickDial: gradient('#3B7A4B', '#12331F', '#FFFFFF'),
};

/** The palette for a type, or null for a type that owns its own ground. */
export function widgetPalette(type: WidgetType): WidgetPalette | null {
  if (type === 'weather') return null;
  return WIDGET_PALETTES[type] ?? null;
}

/** The text tones a type's ground needs. */
export function widgetInk(type: WidgetType): typeof WIDGET_INK[WidgetInkTone] {
  const palette = widgetPalette(type);
  return WIDGET_INK[palette?.ink ?? 'onDark'];
}

/**
 * The tints a widget can be set to (#963), on top of its type's own palette.
 *
 * Why a fixed set and not a colour picker: every entry has to pair a ground with
 * an ink tone that stays legible on it, and a free colour cannot promise that.
 * These are the iOS system colours at widget weight, each with the tone its
 * ground needs — which is the same contract WIDGET_PALETTES keeps.
 */
export const WIDGET_TINTS: Record<string, { label: string; palette: WidgetPalette }> = {
  graphite: { label: 'Graphite', palette: gradient('#3A3A3E', '#101012', '#FFFFFF') },
  blue: { label: 'Blue', palette: gradient('#2F6FD0', '#10294F', '#FFFFFF') },
  green: { label: 'Green', palette: gradient('#2E7D46', '#12331F', '#FFFFFF') },
  indigo: { label: 'Indigo', palette: gradient('#4B4BA8', '#1B1B3A', '#FFFFFF') },
  pink: { label: 'Pink', palette: gradient('#D8497A', '#4A1229', '#FFFFFF') },
  orange: { label: 'Orange', palette: gradient('#D2801E', '#3E2408', '#FFFFFF') },
  // The one light ground, so a widget can be the white card iOS uses for
  // Calendar and Notes. Its ink tone is what makes it safe to offer.
  paper: { label: 'Paper', palette: solid('#FFFFFF', '#F2F2F7', '#FF3B30', 'onLight') },
};

/** The tint ids, in the order a picker should show them. */
export const WIDGET_TINT_IDS: readonly string[] = Object.keys(WIDGET_TINTS);

/**
 * The palette a widget renders with: its tint if it has one, else its type's.
 *
 * An unknown tint id falls back to the type's palette instead of throwing —
 * options come off disk, and a value written by a later version must degrade
 * rather than blank the widget.
 */
export function resolveWidgetPalette(
  type: WidgetType,
  options?: { tint?: string },
): WidgetPalette | null {
  const tint = options?.tint ? WIDGET_TINTS[options.tint] : undefined;
  return tint?.palette ?? widgetPalette(type);
}

/** The ink tones for whatever ground `resolveWidgetPalette` settled on. */
export function resolveWidgetInk(
  type: WidgetType,
  options?: { tint?: string },
): typeof WIDGET_INK[WidgetInkTone] {
  const palette = resolveWidgetPalette(type, options);
  return WIDGET_INK[palette?.ink ?? 'onDark'];
}

/**
 * The system tint applied to a widget, the way iOS applies it (#965).
 *
 * On iOS 18 and later, choosing the Tinted home-screen appearance recolours the
 * whole screen: "The color you pick using the Tinted option shows up virtually
 * everywhere on the Home Screen", widgets included, and the widget is rendered
 * in the ACCENTED mode — desaturated, with the system compositing its own
 * gradient over the result. Our launcher already has that setting for icons
 * (`iconTintEnabled` / `iconTintColor`) and the widgets ignored it, so a tinted
 * home screen had monochrome icons above full-colour widgets.
 *
 * The tint replaces the ground rather than being blended over it: a translucent
 * overlay on ten different palettes gives ten different results, which is the
 * opposite of what the setting is for.
 */
export function systemTintPalette(color: string): WidgetPalette {
  return {
    appearance: {
      surface: 'gradient',
      // The system's own treatment is a gradient over the flat tint, which is
      // what keeps a tinted screen from looking like paper cut-outs.
      gradientColors: [color, shadeHex(color, 0.55)],
      solidColor: { light: shadeHex(color, 0.55), dark: shadeHex(color, 0.55) },
    },
    // Accented rendering tints primary content white on iPhone, iPad and Mac.
    ink: 'onDark',
    accent: '#FFFFFF',
  };
}

/**
 * Multiply a `#rrggbb` by `factor`, for the gradient's darker stop.
 *
 * Non-hex input is returned unchanged: the tint colour comes from settings, and
 * a malformed value must degrade to a flat ground rather than throw inside a
 * render.
 */
export function shadeHex(hex: string, factor: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = Number.parseInt(m[1], 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
  const r = clamp((n >> 16) & 0xff);
  const g = clamp((n >> 8) & 0xff);
  const b = clamp(n & 0xff);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Everything that decides a widget's ground, in the order iOS resolves it:
 * the system tint wins over a per-widget tint, which wins over the type's own
 * palette. The system setting is a statement about the WHOLE home screen, so a
 * widget keeping its own colour through it would read as a bug.
 */
export function widgetSurface(
  type: WidgetType,
  options?: { tint?: string },
  systemTint?: string | null,
): WidgetPalette | null {
  if (systemTint) return systemTintPalette(systemTint);
  return resolveWidgetPalette(type, options);
}

/** The ink tones for whatever `widgetSurface` settled on. */
export function widgetSurfaceInk(
  type: WidgetType,
  options?: { tint?: string },
  systemTint?: string | null,
): typeof WIDGET_INK[WidgetInkTone] {
  const palette = widgetSurface(type, options, systemTint);
  return WIDGET_INK[palette?.ink ?? 'onDark'];
}
