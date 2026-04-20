import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { useSettings } from '../store/SettingsStore';
import {
  CupertinoTheme,
  getTheme,
  Typography,
  Spacing,
  BorderRadius,
  Shadows,
  AnimationConfig,
  AccentColors,
  AccentColorKey,
} from './CupertinoTheme';

const THEME_STORAGE_KEY = '@iostoandroid/theme_preference';
const ACCENT_STORAGE_KEY = '@iostoandroid/accent_color';
const HIGH_CONTRAST_STORAGE_KEY = '@iostoandroid/high_contrast';

export type ThemeMode = 'system' | 'light' | 'dark';

const TEXT_SIZE_SCALE: Record<number, number> = { 0: 0.85, 1: 1.0, 2: 1.15, 3: 1.3 };

type FontWeightValue = '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | 'bold' | 'normal';

function scaleTypography(
  base: typeof Typography,
  textSizeIndex: number,
  boldText: boolean,
): typeof Typography {
  const scale = TEXT_SIZE_SCALE[textSizeIndex] ?? 1.0;
  if (scale === 1.0 && !boldText) return base;

  const boldWeightMap: Record<string, FontWeightValue> = {
    '100': '300', '200': '400', '300': '500',
    '400': '600', '500': '700', '600': '800', '700': '900',
    '800': '900', '900': '900', 'normal': '600', 'bold': '900',
  };

  const result = {} as typeof Typography;
  for (const key of Object.keys(base) as (keyof typeof Typography)[]) {
    const style = base[key];
    const scaledFontSize = Math.round(style.fontSize * scale);
    const scaledLineHeight = Math.round(style.lineHeight * scale);
    const fontWeight = boldText
      ? (boldWeightMap[style.fontWeight] ?? style.fontWeight) as FontWeightValue
      : style.fontWeight;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (result as any)[key] = { ...style, fontSize: scaledFontSize, lineHeight: scaledLineHeight, fontWeight };
  }
  return result;
}

interface ThemeContextValue {
  theme: CupertinoTheme;
  typography: typeof Typography;
  spacing: typeof Spacing;
  borderRadius: typeof BorderRadius;
  shadows: typeof Shadows;
  animation: typeof AnimationConfig;
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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('system');
  const [isReady, setIsReady] = useState(false);
  const [accentColor, setAccentColorState] = useState<AccentColorKey>('blue');
  const [highContrast, setHighContrastState] = useState(false);

  const { settings } = useSettings();

  // Derive isDark from mode + system color scheme
  const systemScheme = useColorScheme();
  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

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
      typography: scaleTypography(Typography, settings.textSizeIndex, settings.boldText),
      spacing: Spacing,
      borderRadius: BorderRadius,
      shadows: Shadows,
      animation: AnimationConfig,
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
    [isDark, isReady, mode, accentColor, highContrast, textScale, settings.textSizeIndex, settings.boldText, toggleTheme, setDark, setThemeMode, setAccentColor, setHighContrast]
  );

  if (!isReady) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
