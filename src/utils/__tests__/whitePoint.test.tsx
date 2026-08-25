import {
  clampWhitePointLevel,
  whitePointToOpacity,
  WHITE_POINT_MIN,
  WHITE_POINT_MAX,
} from '../whitePoint';

describe('whitePoint util (#614)', () => {
  it('defaults to the max level (no reduction) for invalid input', () => {
    expect(clampWhitePointLevel(undefined)).toBe(WHITE_POINT_MAX);
    expect(clampWhitePointLevel(null)).toBe(WHITE_POINT_MAX);
    expect(clampWhitePointLevel(NaN)).toBe(WHITE_POINT_MAX);
    expect(clampWhitePointLevel('0.5')).toBe(WHITE_POINT_MAX);
  });

  it('clamps out-of-range numbers into [0.25, 1.0]', () => {
    expect(clampWhitePointLevel(0)).toBe(WHITE_POINT_MIN);
    expect(clampWhitePointLevel(-5)).toBe(WHITE_POINT_MIN);
    expect(clampWhitePointLevel(2)).toBe(WHITE_POINT_MAX);
    expect(clampWhitePointLevel(0.25)).toBe(0.25);
    expect(clampWhitePointLevel(1.0)).toBe(1.0);
    expect(clampWhitePointLevel(0.5)).toBe(0.5);
  });

  it('converts the level into overlay opacity (1 - level)', () => {
    expect(whitePointToOpacity(1.0)).toBe(0);
    expect(whitePointToOpacity(0.5)).toBe(0.5);
    expect(whitePointToOpacity(0.25)).toBe(0.75);
  });

  it('opacity is always clamped even if an unclamped level is passed', () => {
    expect(whitePointToOpacity(2)).toBe(0);
    expect(whitePointToOpacity(0)).toBe(0.75);
  });
});
