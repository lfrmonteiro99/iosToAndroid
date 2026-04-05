import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { CupertinoTheme, getTheme, Typography, Spacing, BorderRadius, Shadows, AnimationConfig } from './CupertinoTheme';

interface ThemeContextValue {
  theme: CupertinoTheme;
  typography: typeof Typography;
  spacing: typeof Spacing;
  borderRadius: typeof BorderRadius;
  shadows: typeof Shadows;
  animation: typeof AnimationConfig;
  isDark: boolean;
  toggleTheme: () => void;
  setDark: (dark: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [isDark, setIsDark] = useState(systemColorScheme === 'dark');

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => !prev);
  }, []);

  const setDark = useCallback((dark: boolean) => {
    setIsDark(dark);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: getTheme(isDark),
      typography: Typography,
      spacing: Spacing,
      borderRadius: BorderRadius,
      shadows: Shadows,
      animation: AnimationConfig,
      isDark,
      toggleTheme,
      setDark,
    }),
    [isDark, toggleTheme, setDark]
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
