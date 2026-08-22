import { gestureConfig, springForAppLaunchDuration } from '../gestureConfig';

// #512 (§6.3): appLaunchDurationMs (150–450, default 280) must actually change
// the felt speed of the icon-expand spring, not just relabel the same motion.
// The mapping keeps the damping ratio constant (same "feel"/overshoot
// character at any duration) and only rescales how fast the spring gets
// there — a shorter duration is a stiffer, more damped spring; a longer one
// is looser. Physics: for a unit-mass spring, settling time scales as
// 1/naturalFrequency, so stiffness ~ (base/target)^2 and damping ~ (base/target).
describe('springForAppLaunchDuration (#512 §6.3)', () => {
  it('reproduces the existing appLaunch spring exactly at the 280ms default', () => {
    expect(springForAppLaunchDuration(280)).toEqual(gestureConfig.spring.appLaunch);
  });

  it('is stiffer and more damped at the fast extreme (150ms) than at the default', () => {
    const fast = springForAppLaunchDuration(150);
    const base = gestureConfig.spring.appLaunch;
    expect(fast.stiffness).toBeGreaterThan(base.stiffness);
    expect(fast.damping).toBeGreaterThan(base.damping);
  });

  it('is looser and less damped at the slow extreme (450ms) than at the default', () => {
    const slow = springForAppLaunchDuration(450);
    const base = gestureConfig.spring.appLaunch;
    expect(slow.stiffness).toBeLessThan(base.stiffness);
    expect(slow.damping).toBeLessThan(base.damping);
  });

  it('preserves the damping ratio across durations (same feel, different speed)', () => {
    const dampingRatio = (cfg: { stiffness: number; damping: number; mass: number }) =>
      cfg.damping / (2 * Math.sqrt(cfg.stiffness * cfg.mass));

    const base = gestureConfig.spring.appLaunch;
    const fast = springForAppLaunchDuration(150);
    const slow = springForAppLaunchDuration(450);

    expect(dampingRatio(fast)).toBeCloseTo(dampingRatio(base), 5);
    expect(dampingRatio(slow)).toBeCloseTo(dampingRatio(base), 5);
  });

  it('keeps mass at 1 regardless of duration', () => {
    expect(springForAppLaunchDuration(150).mass).toBe(1);
    expect(springForAppLaunchDuration(450).mass).toBe(1);
  });
});
