import { Typography } from '../CupertinoTheme';

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
});
