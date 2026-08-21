import {
  Typography,
  FontFamilies,
  DISPLAY_MIN_FONT_SIZE,
  fontFamilyForSize,
} from '../CupertinoTheme';

describe('CupertinoTheme Typography', () => {
  it('should have fontFamily defined for all typography styles', () => {
    const expectedStyles = [
      'largeTitle',
      'title1',
      'title2',
      'title3',
      'headline',
      'body',
      'callout',
      'subhead',
      'footnote',
      'caption1',
      'caption2',
      'tabLabel',
    ];

    expectedStyles.forEach((styleName) => {
      const style = Typography[styleName as keyof typeof Typography];
      expect(style).toHaveProperty('fontFamily');
      expect(style.fontFamily).toBeDefined();
      expect(style.fontFamily).not.toBeNull();
    });
  });

  it('should use Display font for sizes >= 20pt', () => {
    const displayStyles = ['largeTitle', 'title1', 'title2', 'title3'];
    displayStyles.forEach((styleName) => {
      const style = Typography[styleName as keyof typeof Typography];
      expect(style.fontFamily).toBe('InterDisplay');
    });
  });

  it('should use Text font for sizes < 20pt', () => {
    const textStyles = [
      'headline',
      'body',
      'callout',
      'subhead',
      'footnote',
      'caption1',
      'caption2',
      'tabLabel',
    ];
    textStyles.forEach((styleName) => {
      const style = Typography[styleName as keyof typeof Typography];
      expect(style.fontFamily).toBe('Inter');
    });
  });

  it('applies the 20pt cut to every token, with no third family', () => {
    Object.entries(Typography).forEach(([name, style]) => {
      expect({ name, family: style.fontFamily }).toEqual({
        name,
        family: fontFamilyForSize(style.fontSize),
      });
      expect([FontFamilies.display, FontFamilies.text]).toContain(style.fontFamily);
    });
  });
});

describe('fontFamilyForSize (corte óptico Text/Display)', () => {
  it('treats the 20pt boundary as inclusive for Display', () => {
    expect(fontFamilyForSize(DISPLAY_MIN_FONT_SIZE)).toBe(FontFamilies.display);
  });

  it('keeps the size just below the boundary on Text', () => {
    expect(fontFamilyForSize(DISPLAY_MIN_FONT_SIZE - 1)).toBe(FontFamilies.text);
  });

  it('keeps the size just above the boundary on Display', () => {
    expect(fontFamilyForSize(DISPLAY_MIN_FONT_SIZE + 1)).toBe(FontFamilies.display);
  });

  it('falls back to Text for degenerate sizes', () => {
    // 0, negativos e NaN não são tamanhos legítimos, mas chegam aqui se alguém
    // multiplicar um token por um factor mal calculado: a variante de texto é a
    // escolha inócua, e nunca é `undefined` (que voltaria a dar Roboto).
    [0, -12, Number.NaN].forEach((size) => {
      expect(fontFamilyForSize(size)).toBe(FontFamilies.text);
    });
  });

  it('stays on Display for absurdly large sizes', () => {
    expect(fontFamilyForSize(Number.MAX_SAFE_INTEGER)).toBe(FontFamilies.display);
  });
});
