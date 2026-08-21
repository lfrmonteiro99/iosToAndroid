import { Typography } from '../CupertinoTheme';

// Source: Apple SF Pro typography tracking table
// https://developer.apple.com/design/human-interface-guidelines/typography
// Apple "Tracking (points)" column per size (Size -> Tracking 1/1000 em -> Tracking points).
// Tolerance is 0.05 (toBeCloseTo(x, 1) == |diff| < 0.05), which accommodates the
// documented nits between the shipped values and Apple's exact table:
//   largeTitle 0.41 vs 0.40, title1 0.36 vs 0.38, callout 0.32 vs 0.31, subhead 0.24 vs 0.23.
// This checks the VALUE, not just the sign: a future magnitude regression such as
// headline -0.41 -> -0.05 (|diff|=0.38) makes the test fail, whereas a sign-only check
// would still pass.
const APPLE_TRACKING_TABLE: Record<
  string,
  { fontSize: number; appleTracking: number }
> = {
  largeTitle: { fontSize: 34, appleTracking: 0.4 },
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
    it(`${key} letterSpacing (${appleTracking}) matches Apple tracking within 0.05`, () => {
      const style = Typography[key as keyof typeof Typography];
      expect(style.letterSpacing).toBeCloseTo(appleTracking, 1);
    });
  });

  it('title2 has exactly the corrected negative tracking (-0.26)', () => {
    expect(Typography.title2.letterSpacing).toBe(-0.26);
  });

  it('title3 has exactly the corrected negative tracking (-0.45)', () => {
    expect(Typography.title3.letterSpacing).toBe(-0.45);
  });
});
