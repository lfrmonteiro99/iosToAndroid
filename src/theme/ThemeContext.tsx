import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { useSettings, SettingsState } from '../store/SettingsStore';
import {
  CupertinoTheme,
  getTheme,
  Typography,
  Spacing,
  BorderRadius,
  Shape,
  Shadows,
  AnimationConfig,
  AccentColors,
  AccentColorKey,
  Glass,
  glassSurface,
  fontFamilyForSize,
  FontFamily,
} from './CupertinoTheme';

const THEME_STORAGE_KEY = '@iostoandroid/theme_preference';
const ACCENT_STORAGE_KEY = '@iostoandroid/accent_color';
const HIGH_CONTRAST_STORAGE_KEY = '@iostoandroid/high_contrast';

export type ThemeMode = 'system' | 'light' | 'dark';

const TEXT_SIZE_SCALE: Record<number, number> = { 0: 0.85, 1: 1.0, 2: 1.15, 3: 1.3 };

/**
 * Parse an 'HH:MM' (24h) string into minutes since midnight. Returns null for
 * anything that is not exactly that shape — a corrupt or missing schedule value
 * must never be used to flip the theme, so callers fall back to the OS instead.
 */
export function parseHHMM(hhmm: string | null | undefined): number | null {
  if (typeof hhmm !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Decide darkness purely from the custom schedule for a given instant, in
 * minutes since midnight. The launcher is light from 00:00 up to (and
 * excluding) `lightUntil`, then dark until (and excluding) `darkUntil`, then
 * light again until midnight — matching iOS «Custom Schedule» semantics.
 *
 * Returns null when the schedule is unusable (missing/invalid/equal endpoints),
 * which signals the caller to fall back to the system scheme rather than guess.
 * This is a pure function so the schedule branch is unit-testable without
 * faking the clock or the OS color scheme.
 */
export function isDarkBySchedule(
  nowMinutes: number,
  lightUntil: string,
  darkUntil: string,
): boolean | null {
  const light = parseHHMM(lightUntil);
  const dark = parseHHMM(darkUntil);
  if (light === null || dark === null) return null;
  // Equal endpoints make the interval degenerate (or a zero-length dark window):
  // there is no coherent schedule, so do not drive isDark from it.
  if (light === dark) return null;

  if (light < dark) {
    // Daytime block then dark block, e.g. light until 07:00, dark until 19:00.
    // Light in [00:00, light) and [dark, 24:00); dark in [light, dark).
    return nowMinutes >= light && nowMinutes < dark;
  }
  // Overnight schedule: dark spans midnight, e.g. light until 19:00,
  // dark until 07:00. Light in [dark, light); dark everywhere else.
  return !(nowMinutes >= dark && nowMinutes < light);
}

/**
 * Resolve the active `isDark` from the theme mode, the system color scheme, and
 * the custom Dark Mode schedule. Extracted as a pure function so the scheduled
 * branch is independently testable.
 *
 * @param mode        current theme mode ('system' | 'light' | 'dark')
 * @param systemDark  whether the OS reports a dark color scheme
 * @param automatic   whether the custom schedule overrides the OS (only
 *                    consulted when `mode === 'system'`)
 * @param lightUntil  'HH:MM' Light-Until of the custom schedule
 * @param darkUntil   'HH:MM' Dark-Until of the custom schedule
 * @param now         Date whose local hours/minutes drive the schedule
 */
export function resolveIsDark(
  mode: ThemeMode,
  systemDark: boolean,
  automatic: boolean,
  lightUntil: string,
  darkUntil: string,
  now: Date,
): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  // mode === 'system'
  if (automatic) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const scheduled = isDarkBySchedule(nowMinutes, lightUntil, darkUntil);
    if (scheduled !== null) return scheduled;
    // Degenerate/garbage schedule: never silently flip — follow the OS.
  }
  return systemDark;
}

type FontWeightValue = '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | 'bold' | 'normal';

/**
 * Tipografia resolvida para consumo: igual à forma de `Typography`, excepto
 * que `fontFamily` pode ser `undefined` quando o utilizador escolheu a fonte
 * do sistema (#477) — é isso que faz o RN cair na tipografia da plataforma
 * em vez de continuar a pedir Inter/InterDisplay.
 */
export type ResolvedTypography = {
  [K in keyof typeof Typography]: Omit<(typeof Typography)[K], 'fontFamily'> & { fontFamily?: FontFamily };
};

function resolveTypography(
  base: typeof Typography,
  textSizeIndex: number,
  boldText: boolean,
  fontChoice: SettingsState['fontChoice'],
): ResolvedTypography {
  const scale = TEXT_SIZE_SCALE[textSizeIndex] ?? 1.0;
  if (scale === 1.0 && !boldText && fontChoice === 'inter') return base;

  const boldWeightMap: Record<string, FontWeightValue> = {
    '100': '300', '200': '400', '300': '500',
    '400': '600', '500': '700', '600': '800', '700': '900',
    '800': '900', '900': '900', 'normal': '600', 'bold': '900',
  };

  const entries = Object.entries(base).map(([key, style]) => {
    const scaledFontSize = Math.round(style.fontSize * scale);
    const scaledLineHeight = Math.round(style.lineHeight * scale);
    const fontWeight = boldText
      ? (boldWeightMap[style.fontWeight] ?? style.fontWeight) as FontWeightValue
      : style.fontWeight;
    // O corte Text/Display é do tamanho renderizado: escalar o token pode
    // atravessar os 20pt nos dois sentidos, e a família tem de acompanhar.
    // 'system' pede a fonte da plataforma: undefined, nunca um fallback fixo.
    return [key, {
      ...style,
      fontSize: scaledFontSize,
      lineHeight: scaledLineHeight,
      fontWeight,
      fontFamily: fontChoice === 'system' ? undefined : fontFamilyForSize(scaledFontSize),
    }];
  });
  return Object.fromEntries(entries) as ResolvedTypography;
}

interface ThemeContextValue {
  theme: CupertinoTheme;
  typography: ResolvedTypography;
  spacing: typeof Spacing;
  borderRadius: typeof BorderRadius;
  shape: typeof Shape;
  shadows: typeof Shadows;
  animation: typeof AnimationConfig;
  glass: typeof Glass;
  glassSurface: typeof glassSurface;
  isDark: boolean;
  isReady: boolean;
  mode: ThemeMode;
  accentColor: AccentColorKey;
  highContrast: boolean;
  textScale: number;
  toggleTheme: () => void;
  setDark: (dark: boolean) => void;
  setThemeMode: (m: ThemeMode) => void;
  setAccentColor: (color: AccentColorKey) => void;
  setHighContrast: (enabled: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  gateFirstRender = true,
}: {
  children: React.ReactNode;
  /**
   * Hold back the first render until the saved theme has loaded, so the app never
   * flashes the wrong theme on launch. See the sibling flag on `SettingsProvider`
   * — the test harness passes `false` because it renders synchronously.
   */
  gateFirstRender?: boolean;
}) {
  const [mode, setMode] = useState<ThemeMode>('system');
  const [isReady, setIsReady] = useState(false);
  const [accentColor, setAccentColorState] = useState<AccentColorKey>('blue');
  const [highContrast, setHighContrastState] = useState(false);

  const { settings } = useSettings();

  // Derive isDark from mode + system color scheme, or the custom Dark Mode
  // schedule when the user opted into "Automatic" with a custom schedule.
  const systemScheme = useColorScheme();
  const isDark = resolveIsDark(
    mode,
    systemScheme === 'dark',
    settings.darkModeAutomatic,
    settings.darkModeLightUntil,
    settings.darkModeDarkUntil,
    new Date(),
  );

  // Hydrate saved preferences on mount
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(THEME_STORAGE_KEY),
      AsyncStorage.getItem(ACCENT_STORAGE_KEY),
      AsyncStorage.getItem(HIGH_CONTRAST_STORAGE_KEY),
    ]).then(([storedTheme, storedAccent, storedHighContrast]) => {
      if (storedTheme === 'light' || storedTheme === 'dark') {
        setMode(storedTheme);
      } else if (storedTheme === 'system') {
        setMode('system');
      }
      // unknown/missing → keep default 'system'
      if (storedAccent !== null && storedAccent in AccentColors) {
        setAccentColorState(storedAccent as AccentColorKey);
      }
      if (storedHighContrast !== null) {
        setHighContrastState(storedHighContrast === 'true');
      }
      setIsReady(true);
    });
  }, []);

  // Persist mode on change
  useEffect(() => {
    if (isReady) {
      AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    }
  }, [mode, isReady]);

  // Persist accent color on change
  useEffect(() => {
    if (isReady) {
      AsyncStorage.setItem(ACCENT_STORAGE_KEY, accentColor);
    }
  }, [accentColor, isReady]);

  // Persist high contrast on change
  useEffect(() => {
    if (isReady) {
      AsyncStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, String(highContrast));
    }
  }, [highContrast, isReady]);

  // Toggle between 'light' and 'dark' (ignores system) — kept for back-compat
  const toggleTheme = useCallback(() => {
    setMode((m) => (m === 'dark' ? 'light' : 'dark'));
  }, []);

  const setDark = useCallback((dark: boolean) => {
    setMode(dark ? 'dark' : 'light');
  }, []);

  const setThemeMode = useCallback((m: ThemeMode) => {
    setMode(m);
  }, []);

  const setAccentColor = useCallback((color: AccentColorKey) => {
    setAccentColorState(color);
  }, []);

  const setHighContrast = useCallback((enabled: boolean) => {
    setHighContrastState(enabled);
  }, []);

  const textScale = TEXT_SIZE_SCALE[settings.textSizeIndex] ?? 1.0;

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: getTheme(isDark, accentColor, highContrast),
      typography: resolveTypography(Typography, settings.textSizeIndex, settings.boldText, settings.fontChoice),
      spacing: Spacing,
      borderRadius: BorderRadius,
      shape: Shape,
      shadows: Shadows,
      animation: AnimationConfig,
      glass: Glass,
      glassSurface,
      isDark,
      isReady,
      mode,
      accentColor,
      highContrast,
      textScale,
      toggleTheme,
      setDark,
      setThemeMode,
      setAccentColor,
      setHighContrast,
    }),
    [isDark, isReady, mode, accentColor, highContrast, textScale, settings.textSizeIndex, settings.boldText, settings.fontChoice, toggleTheme, setDark, setThemeMode, setAccentColor, setHighContrast]
  );

  if (gateFirstRender && !isReady) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
