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

/**
 * Famílias de texto da app. Os nomes são os que o Android tem registados em
 * `ReactFontManager` — têm de bater certo com `expo.plugins["expo-font"]` no
 * `app.json`, que é onde cada peso (400/500/600/700) é associado ao ficheiro
 * estático correspondente. Sem esse mapa, `fontWeight` não faz nada de útil
 * numa família custom no Android: o `ReactFontManager` só distingue NORMAL de
 * BOLD (`nearestStyle`, ReactFontManager.kt:132-139), o 500/600 cai no ficheiro
 * Regular e o ≥700 sai em Roboto. Ver o corpo do PR do #475.
 */
export const FontFamilies = { display: 'InterDisplay', text: 'Inter' } as const;

export type FontFamily = (typeof FontFamilies)[keyof typeof FontFamilies];

/** Ponto a partir do qual a Apple (e o Inter) troca Text por Display. Inclusivo. */
export const DISPLAY_MIN_FONT_SIZE = 20;

/**
 * O corte óptico é do tamanho *renderizado*, não do tamanho de desenho: com o
 * Dynamic Type ligado um `body` de 17pt pode ir aos 22pt, e aí a variante certa
 * é a Display. Por isso o `scaleTypography` volta a passar por aqui depois de
 * escalar, em vez de arrastar a família do token.
 */
export function fontFamilyForSize(fontSize: number): FontFamily {
  return fontSize >= DISPLAY_MIN_FONT_SIZE ? FontFamilies.display : FontFamilies.text;
}

// iOS Typography Scale — Inter family with Display variant for sizes ≥20pt, Text variant for <20pt
export const Typography = {
  largeTitle: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '700' as const,
    letterSpacing: 0.41,
    fontFamily: FontFamilies.display,
  },
  title1: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700' as const,
    letterSpacing: 0.36,
    fontFamily: FontFamilies.display,
  },
  title2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700' as const,
    letterSpacing: 0.35,
    fontFamily: FontFamilies.display,
  },
  title3: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '600' as const,
    letterSpacing: 0.38,
    fontFamily: FontFamilies.display,
  },
  headline: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600' as const,
    letterSpacing: -0.41,
    fontFamily: FontFamilies.text,
  },
  body: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '400' as const,
    letterSpacing: -0.41,
    fontFamily: FontFamilies.text,
  },
  callout: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '400' as const,
    letterSpacing: -0.32,
    fontFamily: FontFamilies.text,
  },
  subhead: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400' as const,
    letterSpacing: -0.24,
    fontFamily: FontFamilies.text,
  },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400' as const,
    letterSpacing: -0.08,
    fontFamily: FontFamilies.text,
  },
  caption1: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400' as const,
    letterSpacing: 0,
    fontFamily: FontFamilies.text,
  },
  caption2: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '400' as const,
    letterSpacing: 0.07,
    fontFamily: FontFamilies.text,
  },
  tabLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '500' as const,
    letterSpacing: 0,
    fontFamily: FontFamilies.text,
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

// Glass surfaces with hairline borders (WCAG-compliant separation for solid glass)
export const Glass = {
  light: {
    thin: { backgroundColor: 'rgba(242,242,247,0.72)' },
    regular: { backgroundColor: 'rgba(242,242,247,0.82)' },
    thick: { backgroundColor: 'rgba(242,242,247,0.94)' },
    hairline: 'rgba(255,255,255,0.35)',
  },
  dark: {
    thin: { backgroundColor: 'rgba(28,28,30,0.68)' },
    regular: { backgroundColor: 'rgba(28,28,30,0.78)' },
    thick: { backgroundColor: 'rgba(28,28,30,0.92)' },
    hairline: 'rgba(255,255,255,0.12)',
  },
} as const;

export function glassSurface(dark: boolean, weight: 'thin' | 'regular' | 'thick' = 'regular') {
  const g = dark ? Glass.dark : Glass.light;
  return {
    ...g[weight],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: g.hairline,
  };
}

// Border Radius
export const BorderRadius = {
  small: 8,
  medium: 12,
  large: 16,
  extraLarge: 20,
  pill: 9999,
  // Named tokens for recurrent values that don't fit the standard scale
  tag: 7,       // small list section corners, chip sub-elements
  input: 10,    // search bars, text fields
  card14: 14,   // dialog containers, sheet list items
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
  // Stronger drop shadow for interactive thumbs (sliders, switches)
  thumb: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
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
