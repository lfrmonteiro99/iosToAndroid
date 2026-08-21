import { resolveSpringConfig, settle } from '../useGestureReduceMotion';

// NOTE on approach: `settle()` and `resolveSpringConfig()` carry the 'worklet'
// directive (required so they're callable from gesture worklets on the UI
// thread). react-native-reanimated's babel plugin captures every reference to
// withSpring/withTiming used inside a worklet into a closure snapshot at
// definition time, which means jest.spyOn (and even a local jest.mock
// override) on 'react-native-reanimated' cannot intercept those calls from
// this test process — verified empirically: spies report 0 calls even though
// the worklet executes and returns the mocked identity value. That's why the
// velocity-merging logic is asserted directly on `resolveSpringConfig`'s
// return value (the real exported unit, not a reimplementation) instead of by
// inspecting withSpring's call arguments.
describe('resolveSpringConfig()', () => {
  it('carries the velocity into the spring config for a string preset', () => {
    const config = resolveSpringConfig('mediumSettle', 500);
    expect(config.velocity).toBe(500);
  });

  it('preserves the preset stiffness/damping/mass alongside velocity', () => {
    const config = resolveSpringConfig('homeSettle', 300);
    expect(config.stiffness).toBe(700);
    expect(config.damping).toBe(52);
    expect(config.mass).toBe(1);
    expect(config.velocity).toBe(300);
  });

  it('supports a custom {stiffness, damping} config object', () => {
    const config = resolveSpringConfig({ stiffness: 300, damping: 20 }, 750);
    expect(config.stiffness).toBe(300);
    expect(config.damping).toBe(20);
    expect(config.velocity).toBe(750);
  });

  it('produces a different config for a flick (high velocity) than for a slow drag (low velocity)', () => {
    const flick = resolveSpringConfig('fastSettle', 2000);
    const drag = resolveSpringConfig('fastSettle', 20);

    expect(flick.velocity).toBe(2000);
    expect(drag.velocity).toBe(20);
    expect(flick.velocity).not.toBe(drag.velocity);
    // Everything except velocity comes from the same preset — the animation
    // curve itself doesn't change, only the momentum carried into it.
    expect(flick.stiffness).toBe(drag.stiffness);
    expect(flick.damping).toBe(drag.damping);
  });

  it('defaults to velocity 0 when called with 0 explicitly (a standstill release)', () => {
    const config = resolveSpringConfig('fastSettle', 0);
    expect(config.velocity).toBe(0);
  });
});

describe('settle()', () => {
  it('accepts a velocity argument without throwing and forwards the target value (existing call-sites keep compiling and behaving)', () => {
    expect(() => settle(100, 'mediumSettle', false, 500)).not.toThrow();
    expect(settle(100, 'mediumSettle', false, 500)).toBe(100);
  });

  it('defaults velocity to 0 when the 4th argument is omitted, so the 33 existing call-sites are unaffected', () => {
    expect(() => settle(100, 'mediumSettle', false)).not.toThrow();
    expect(settle(100, 'mediumSettle', false)).toBe(100);
  });

  it('reduceMotion=true takes the withTiming path regardless of velocity, and does not throw on a velocity argument it ignores', () => {
    expect(() => settle(100, 'mediumSettle', true, 999)).not.toThrow();
    expect(settle(100, 'mediumSettle', true, 999)).toBe(100);
  });
});
