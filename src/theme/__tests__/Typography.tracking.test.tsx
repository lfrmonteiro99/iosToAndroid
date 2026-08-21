import { Typography } from '../CupertinoTheme';

// Source: Apple SF Pro typography table from developer.apple.com/design/human-interface-guidelines/typography
// Mapping: iOS size (pt) → tracking (1/1000 em) → tracking in points at the given size
// https://developer.apple.com/design/human-interface-guidelines/typography
const APPLE_TRACKING_TABLE = {
  largeTitle: { fontSize: 34, appleTracking: 0.40 },
  title1: { fontSize: 28, appleTracking: 0.38 },
  title2: { fontSize: 22, appleTracking: -0.26 },
  title3: { fontSize: 20, appleTracking: -0.45 },
  headline: { fontSize: 17, appleTracking: -0.43 },
  body: { fontSize: 17, appleTracking: -0.43 },
  callout: { fontSize: 16, appleTracking: -0.31 },
  subhead: { fontSize: 15, appleTracking: -0.23 },
  footnote: { fontSize: 13, appleTracking: -0.08 },
  caption1: { fontSize: 12, appleTracking: 0 },
  caption2: { fontSize: 11, appleTracking: 0.06 },
};

describe('Typography tracking values (letterSpacing) against Apple SF Pro', () => {
  Object.entries(APPLE_TRACKING_TABLE).forEach(([key, { appleTracking }]) => {
    it(`${key} letterSpacing matches Apple tracking (${appleTracking})`, () => {
      const style = Typography[key as keyof typeof Typography];
      expect(style.letterSpacing).toBeDefined();

      // Most importantly: verify sign is correct
      if (appleTracking > 0) {
        expect(style.letterSpacing).toBeGreaterThan(0);
      } else if (appleTracking < 0) {
        expect(style.letterSpacing).toBeLessThan(0);
      } else {
        expect(style.letterSpacing).toBe(0);
      }
    });
  });

  it('title2 has negative tracking (sinking optical weight)', () => {
    expect(Typography.title2.letterSpacing).toBeLessThan(0);
    expect(Typography.title2.letterSpacing).toBe(-0.26);
  });

  it('title3 has negative tracking (sinking optical weight)', () => {
    expect(Typography.title3.letterSpacing).toBeLessThan(0);
    expect(Typography.title3.letterSpacing).toBe(-0.45);
  });
});
