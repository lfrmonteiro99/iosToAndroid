import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CupertinoTheme, getTheme, Typography, Spacing, BorderRadius, Shadows, AnimationConfig } from './CupertinoTheme';

const THEME_STORAGE_KEY = '@iostoandroid/theme_preference';

interface ThemeContextValue {
  theme: CupertinoTheme;
  typography: typeof Typography;
  spacing: typeof Spacing;
  borderRadius: typeof BorderRadius;
  shadows: typeof Shadows;
  animation: typeof AnimationConfig;
  isDark: boolean;
  isReady: boolean;
  toggleTheme: () => void;
  setDark: (dark: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initial value: apply time-based rule immediately
  const initHour = new Date().getHours();
  const [isDark, setIsDark] = useState(initHour >= 19 || initHour < 7);
  const [isReady, setIsReady] = useState(false);
  const [hasUserOverride, setHasUserOverride] = useState(false);

  // Hydrate saved preference on mount
  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      if (stored !== null) {
        setHasUserOverride(true);
        setIsDark(stored === 'dark');
      }
      setIsReady(true);
    });
  }, []);

  // Persist on change
  useEffect(() => {
    if (isReady && hasUserOverride) {
      AsyncStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    }
  }, [isDark, isReady, hasUserOverride]);

  // Auto dark mode based on time of day (7pm–7am) when no user override
  useEffect(() => {
    if (hasUserOverride) return;
    const applyTimeDark = () => {
      const hour = new Date().getHours();
      setIsDark(hour >= 19 || hour < 7);
    };
    const timer = setTimeout(applyTimeDark, 0);
    const interval = setInterval(applyTimeDark, 60000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [hasUserOverride]);

  // isDark is the single source of truth: set by user override or time-based auto-dark
  const effectiveDark = isDark;

  const toggleTheme = useCallback(() => {
    setHasUserOverride(true);
    setIsDark((prev) => !prev);
  }, []);

  const setDark = useCallback((dark: boolean) => {
    setHasUserOverride(true);
    setIsDark(dark);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: getTheme(effectiveDark),
      typography: Typography,
      spacing: Spacing,
      borderRadius: BorderRadius,
      shadows: Shadows,
      animation: AnimationConfig,
      isDark: effectiveDark,
      isReady,
      toggleTheme,
      setDark,
    }),
    [effectiveDark, isReady, toggleTheme, setDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
