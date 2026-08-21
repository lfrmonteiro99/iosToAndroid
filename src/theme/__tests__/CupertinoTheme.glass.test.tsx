import { StyleSheet } from 'react-native';
import { Glass, glassSurface } from '../CupertinoTheme';

describe('Glass tokens and glassSurface helper', () => {
  describe('Glass token values', () => {
    it('exports Glass with light and dark variants', () => {
      expect(Glass).toBeDefined();
      expect(Glass.light).toBeDefined();
      expect(Glass.dark).toBeDefined();
    });

    it('light variant has thin, regular, thick, and hairline', () => {
      expect(Glass.light.thin).toBeDefined();
      expect(Glass.light.regular).toBeDefined();
      expect(Glass.light.thick).toBeDefined();
      expect(Glass.light.hairline).toBeDefined();
    });

    it('dark variant has thin, regular, thick, and hairline', () => {
      expect(Glass.dark.thin).toBeDefined();
      expect(Glass.dark.regular).toBeDefined();
      expect(Glass.dark.thick).toBeDefined();
      expect(Glass.dark.hairline).toBeDefined();
    });

    it('light weight values have correct alpha: thin=0.72, regular=0.82, thick=0.94', () => {
      expect(Glass.light.thin.backgroundColor).toContain('rgba(242,242,247,0.72)');
      expect(Glass.light.regular.backgroundColor).toContain('rgba(242,242,247,0.82)');
      expect(Glass.light.thick.backgroundColor).toContain('rgba(242,242,247,0.94)');
    });

    it('dark weight values have correct alpha: thin=0.68, regular=0.78, thick=0.92', () => {
      expect(Glass.dark.thin.backgroundColor).toContain('rgba(28,28,30,0.68)');
      expect(Glass.dark.regular.backgroundColor).toContain('rgba(28,28,30,0.78)');
      expect(Glass.dark.thick.backgroundColor).toContain('rgba(28,28,30,0.92)');
    });

    it('light hairline is rgba(255,255,255,0.35)', () => {
      expect(Glass.light.hairline).toBe('rgba(255,255,255,0.35)');
    });

    it('dark hairline is rgba(255,255,255,0.12)', () => {
      expect(Glass.dark.hairline).toBe('rgba(255,255,255,0.12)');
    });
  });

  describe('glassSurface helper function', () => {
    it('exports glassSurface function', () => {
      expect(glassSurface).toBeDefined();
      expect(typeof glassSurface).toBe('function');
    });

    it('light mode regular is default', () => {
      const result = glassSurface(false);
      expect(result.backgroundColor).toContain('rgba(242,242,247,0.82)');
      expect(result.borderTopWidth).toBe(StyleSheet.hairlineWidth);
      expect(result.borderTopColor).toBe('rgba(255,255,255,0.35)');
    });

    it('dark mode regular is default when dark=true', () => {
      const result = glassSurface(true);
      expect(result.backgroundColor).toContain('rgba(28,28,30,0.78)');
      expect(result.borderTopWidth).toBe(StyleSheet.hairlineWidth);
      expect(result.borderTopColor).toBe('rgba(255,255,255,0.12)');
    });

    it('light thin includes border', () => {
      const result = glassSurface(false, 'thin');
      expect(result.backgroundColor).toContain('rgba(242,242,247,0.72)');
      expect(result.borderTopWidth).toBe(StyleSheet.hairlineWidth);
      expect(result.borderTopColor).toBe('rgba(255,255,255,0.35)');
    });

    it('light thick includes border', () => {
      const result = glassSurface(false, 'thick');
      expect(result.backgroundColor).toContain('rgba(242,242,247,0.94)');
      expect(result.borderTopWidth).toBe(StyleSheet.hairlineWidth);
      expect(result.borderTopColor).toBe('rgba(255,255,255,0.35)');
    });

    it('dark thin includes border', () => {
      const result = glassSurface(true, 'thin');
      expect(result.backgroundColor).toContain('rgba(28,28,30,0.68)');
      expect(result.borderTopWidth).toBe(StyleSheet.hairlineWidth);
      expect(result.borderTopColor).toBe('rgba(255,255,255,0.12)');
    });

    it('dark thick includes border', () => {
      const result = glassSurface(true, 'thick');
      expect(result.backgroundColor).toContain('rgba(28,28,30,0.92)');
      expect(result.borderTopWidth).toBe(StyleSheet.hairlineWidth);
      expect(result.borderTopColor).toBe('rgba(255,255,255,0.12)');
    });

    it('border is always present and not optional', () => {
      const variants = [
        { dark: false, weight: 'thin' as const },
        { dark: false, weight: 'regular' as const },
        { dark: false, weight: 'thick' as const },
        { dark: true, weight: 'thin' as const },
        { dark: true, weight: 'regular' as const },
        { dark: true, weight: 'thick' as const },
      ];

      variants.forEach(({ dark, weight }) => {
        const result = glassSurface(dark, weight);
        expect(result.borderTopWidth).toBe(StyleSheet.hairlineWidth);
        expect(result.borderTopColor).toBeDefined();
        expect(result.borderTopColor).not.toBeUndefined();
      });
    });

    it('light and dark hairlines are different', () => {
      const lightResult = glassSurface(false);
      const darkResult = glassSurface(true);
      expect(lightResult.borderTopColor).not.toBe(darkResult.borderTopColor);
    });
  });
});
