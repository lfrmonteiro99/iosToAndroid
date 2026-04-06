import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { useColorScheme } from 'react-native';
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
  const systemColorScheme = useColorScheme();
  const [isDark, setIsDark] = useState(systemColorScheme === 'dark');
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

  // Derive theme from system when no user override
  const effectiveDark = hasUserOverride ? isDark : (systemColorScheme === 'dark');

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
