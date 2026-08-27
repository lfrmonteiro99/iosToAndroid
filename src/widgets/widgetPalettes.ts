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
