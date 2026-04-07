import { StyleSheet } from 'react-native';

// iOS System Colors (Light & Dark)
export const SystemColors = {
  light: {
    systemBlue: '#007AFF',
    systemGreen: '#34C759',
    systemRed: '#FF3B30',
    systemOrange: '#FF9500',
    systemYellow: '#FFCC00',
    systemPurple: '#AF52DE',
    systemPink: '#FF2D55',
    systemTeal: '#5AC8FA',
    systemIndigo: '#5856D6',

    // Semantic colors
    accent: '#007AFF',
    error: '#FF3B30',
    warning: '#FF9500',
    success: '#34C759',
    info: '#007AFF',

    // Semantic text aliases
    textPrimary: '#000000',
    textSecondary: 'rgba(60, 60, 67, 0.6)',
    textTertiary: 'rgba(60, 60, 67, 0.3)',

    // Grays
    systemGray: '#8E8E93',
    systemGray2: '#AEAEB2',
    systemGray3: '#C7C7CC',
    systemGray4: '#D1D1D6',
    systemGray5: '#E5E5EA',
    systemGray6: '#F2F2F7',

    // Labels
    label: '#000000',
    secondaryLabel: 'rgba(60, 60, 67, 0.6)',
    tertiaryLabel: 'rgba(60, 60, 67, 0.3)',
    quaternaryLabel: 'rgba(60, 60, 67, 0.18)',

    // Backgrounds
    systemBackground: '#FFFFFF',
    secondarySystemBackground: '#F2F2F7',
    tertiarySystemBackground: '#FFFFFF',

    // Grouped Backgrounds
    systemGroupedBackground: '#F2F2F7',
    secondarySystemGroupedBackground: '#FFFFFF',
    tertiarySystemGroupedBackground: '#F2F2F7',

    // Fills
    systemFill: 'rgba(120, 120, 128, 0.2)',
    secondarySystemFill: 'rgba(120, 120, 128, 0.16)',
    tertiarySystemFill: 'rgba(118, 118, 128, 0.12)',
    quaternarySystemFill: 'rgba(116, 116, 128, 0.08)',

    // Separator
    separator: 'rgba(60, 60, 67, 0.29)',
    opaqueSeparator: '#C6C6C8',
  },
  dark: {
    systemBlue: '#0A84FF',
    systemGreen: '#30D158',
    systemRed: '#FF453A',
    systemOrange: '#FF9F0A',
    systemYellow: '#FFD60A',
    systemPurple: '#BF5AF2',
    systemPink: '#FF375F',
    systemTeal: '#64D2FF',
    systemIndigo: '#5E5CE6',

    // Semantic colors
    accent: '#0A84FF',
    error: '#FF453A',
    warning: '#FF9F0A',
    success: '#30D158',
    info: '#0A84FF',

    // Semantic text aliases
    textPrimary: '#FFFFFF',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    textTertiary: 'rgba(235, 235, 245, 0.3)',

    // Grays
    systemGray: '#8E8E93',
    systemGray2: '#636366',
    systemGray3: '#48484A',
    systemGray4: '#3A3A3C',
    systemGray5: '#2C2C2E',
    systemGray6: '#1C1C1E',

    // Labels
    label: '#FFFFFF',
    secondaryLabel: 'rgba(235, 235, 245, 0.6)',
    tertiaryLabel: 'rgba(235, 235, 245, 0.3)',
    quaternaryLabel: 'rgba(235, 235, 245, 0.18)',

    // Backgrounds
    systemBackground: '#000000',
    secondarySystemBackground: '#1C1C1E',
    tertiarySystemBackground: '#2C2C2E',

    // Grouped Backgrounds
    systemGroupedBackground: '#000000',
    secondarySystemGroupedBackground: '#1C1C1E',
    tertiarySystemGroupedBackground: '#2C2C2E',

    // Fills
    systemFill: 'rgba(120, 120, 128, 0.36)',
    secondarySystemFill: 'rgba(120, 120, 128, 0.32)',
    tertiarySystemFill: 'rgba(118, 118, 128, 0.24)',
    quaternarySystemFill: 'rgba(118, 118, 128, 0.18)',

    // Separator
    separator: 'rgba(84, 84, 88, 0.6)',
    opaqueSeparator: '#38383A',
  },
};

// High Contrast color overrides (applied on top of light/dark)
export const HighContrastOverrides = {
  light: {
    label: '#000000',
    secondaryLabel: 'rgba(60, 60, 67, 0.85)',
    tertiaryLabel: 'rgba(60, 60, 67, 0.55)',
    separator: 'rgba(60, 60, 67, 0.5)',
    opaqueSeparator: '#8E8E93',
    systemBackground: '#FFFFFF',
    secondarySystemBackground: '#E5E5EA',
    textPrimary: '#000000',
    textSecondary: 'rgba(60, 60, 67, 0.85)',
    textTertiary: 'rgba(60, 60, 67, 0.55)',
  },
  dark: {
    label: '#FFFFFF',
    secondaryLabel: 'rgba(235, 235, 245, 0.85)',
    tertiaryLabel: 'rgba(235, 235, 245, 0.55)',
    separator: 'rgba(235, 235, 245, 0.4)',
    opaqueSeparator: '#636366',
    systemBackground: '#000000',
    secondarySystemBackground: '#1C1C1E',
    textPrimary: '#FFFFFF',
    textSecondary: 'rgba(235, 235, 245, 0.85)',
    textTertiary: 'rgba(235, 235, 245, 0.55)',
  },
};

// Accent color options
export const AccentColors = {
  blue: { light: '#007AFF', dark: '#0A84FF' },
  purple: { light: '#AF52DE', dark: '#BF5AF2' },
  pink: { light: '#FF2D55', dark: '#FF375F' },
  red: { light: '#FF3B30', dark: '#FF453A' },
  orange: { light: '#FF9500', dark: '#FF9F0A' },
  green: { light: '#34C759', dark: '#30D158' },
} as const;

export type AccentColorKey = keyof typeof AccentColors;

export type CupertinoColors = typeof SystemColors.light;

// iOS Typography Scale (SF Pro approximation)
export const Typography = {
  largeTitle: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '700' as const,
    letterSpacing: 0.41,
  },
  title1: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700' as const,
    letterSpacing: 0.36,
  },
  title2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700' as const,
    letterSpacing: 0.35,
  },
  title3: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '600' as const,
    letterSpacing: 0.38,
  },
  headline: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600' as const,
    letterSpacing: -0.41,
  },
  body: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '400' as const,
    letterSpacing: -0.41,
  },
  callout: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '400' as const,
    letterSpacing: -0.32,
  },
  subhead: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400' as const,
    letterSpacing: -0.24,
  },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400' as const,
    letterSpacing: -0.08,
  },
  caption1: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400' as const,
    letterSpacing: 0,
  },
  caption2: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '400' as const,
    letterSpacing: 0.07,
  },
  tabLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '500' as const,
    letterSpacing: 0,
  },
};

export type TypographyStyle = keyof typeof Typography;

// Spacing (4px base grid)
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// Border Radius
export const BorderRadius = {
  small: 8,
  medium: 12,
  large: 16,
  extraLarge: 20,
  pill: 9999,
} as const;

// iOS-style Shadows (soft, not Material elevation)
export const Shadows = StyleSheet.create({
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 1,
    elevation: 1,
  },
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 8,
  },
});

// Animation constants matching iOS spring dynamics
export const AnimationConfig = {
  springBouncy: { damping: 10, stiffness: 150, mass: 1 },
  springSnappy: { damping: 20, stiffness: 400, mass: 1 },
  springGentle: { damping: 25, stiffness: 200, mass: 1 },
  defaultSpring: { damping: 20, stiffness: 300, mass: 1 },
  gentleSpring: { damping: 15, stiffness: 150, mass: 1 },
  duration: { fast: 200, normal: 350, slow: 500 },
} as const;

// Complete theme object
export interface CupertinoTheme {
  dark: boolean;
  colors: CupertinoColors;
}

export function getTheme(
  dark: boolean,
  accentKey: AccentColorKey = 'blue',
  highContrast: boolean = false,
): CupertinoTheme {
  const base = dark ? { ...SystemColors.dark } : { ...SystemColors.light };
  const accentColor = AccentColors[accentKey][dark ? 'dark' : 'light'];
  base.accent = accentColor;
  base.systemBlue = accentColor;
  if (highContrast) {
    const overrides = dark ? HighContrastOverrides.dark : HighContrastOverrides.light;
    Object.assign(base, overrides);
  }
  return { dark, colors: base };
}
