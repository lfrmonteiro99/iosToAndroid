import {
  PERFORMANCE_PROFILES,
  PERFORMANCE_PROFILE_ORDER,
  PERFORMANCE_PROFILE_LABELS,
  normalizePerformanceProfile,
  getPerformanceProfileTriggers,
  performanceProfileIndex,
} from '../performanceProfile';

describe('performanceProfile (#631 child: profile picker + triggers)', () => {
  // --- Labels / order (drives CupertinoSegmentedControl.values) ---

  it('exposes exactly the five requested profiles in display order', () => {
    expect(PERFORMANCE_PROFILE_ORDER).toEqual([
      'normal',
      'performance',
      'saver',
      'sleep',
      'travel',
    ]);
    expect(PERFORMANCE_PROFILE_LABELS).toEqual([
      'Normal',
      'Performance',
      'Saver',
      'Sleep',
      'Travel',
    ]);
  });

  it('every profile key has a non-empty label and description', () => {
    for (const key of PERFORMANCE_PROFILE_ORDER) {
      const def = PERFORMANCE_PROFILES[key];
      expect(def.label.trim().length).toBeGreaterThan(0);
      expect(def.description.trim().length).toBeGreaterThan(0);
    }
  });

  // --- Triggers: what selecting each profile applies ---

  it('normal applies no patch (baseline)', () => {
    expect(getPerformanceProfileTriggers('normal')).toEqual({});
  });

  it('performance turns Low Power Mode off and transparency off', () => {
    expect(getPerformanceProfileTriggers('performance')).toEqual({
      lowPowerMode: false,
      reduceTransparency: false,
    });
  });

  it('saver turns Low Power Mode and Reduce Transparency on', () => {
    expect(getPerformanceProfileTriggers('saver')).toEqual({
      lowPowerMode: true,
      reduceTransparency: true,
    });
  });

  it('sleep turns Low Power Mode and Reduce White Point on', () => {
    expect(getPerformanceProfileTriggers('sleep')).toEqual({
      lowPowerMode: true,
      reduceWhitePoint: true,
    });
  });

  it('travel turns Low Power Mode on and Location Services on', () => {
    expect(getPerformanceProfileTriggers('travel')).toEqual({
      lowPowerMode: true,
      locationServices: true,
    });
  });

  it('triggers only reference existing SettingsState keys', () => {
    const knownKeys = new Set([
      'lowPowerMode',
      'reduceTransparency',
      'reduceWhitePoint',
      'locationServices',
    ]);
    for (const key of PERFORMANCE_PROFILE_ORDER) {
      const patch = PERFORMANCE_PROFILES[key].triggers;
      for (const patchKey of Object.keys(patch)) {
        expect(knownKeys.has(patchKey)).toBe(true);
      }
    }
  });

  // --- normalizePerformanceProfile: hostile / missing input ---

  it('keeps a valid profile untouched', () => {
    expect(normalizePerformanceProfile('performance')).toBe('performance');
    expect(normalizePerformanceProfile('travel')).toBe('travel');
  });

  it('collapses garbage to normal (baseline), never throws', () => {
    expect(normalizePerformanceProfile('')).toBe('normal');
    expect(normalizePerformanceProfile(null)).toBe('normal');
    expect(normalizePerformanceProfile(undefined)).toBe('normal');
    expect(normalizePerformanceProfile('PERFORMANCE')).toBe('normal'); // case-sensitive
    expect(normalizePerformanceProfile('highpower')).toBe('normal');
    expect(normalizePerformanceProfile(42 as never)).toBe('normal');
    expect(normalizePerformanceProfile({} as never)).toBe('normal');
  });

  it('getPerformanceProfileTriggers treats unknown input as normal (no patch)', () => {
    expect(getPerformanceProfileTriggers('unknown')).toEqual({});
    expect(getPerformanceProfileTriggers(null)).toEqual({});
    expect(getPerformanceProfileTriggers(undefined)).toEqual({});
  });

  // --- index mapping (wires selectedIndex <-> profile key) ---

  it('maps each profile to its display-order index', () => {
    expect(performanceProfileIndex('normal')).toBe(0);
    expect(performanceProfileIndex('performance')).toBe(1);
    expect(performanceProfileIndex('saver')).toBe(2);
    expect(performanceProfileIndex('sleep')).toBe(3);
    expect(performanceProfileIndex('travel')).toBe(4);
  });

  it('maps unknown input to index 0 (normal)', () => {
    expect(performanceProfileIndex('garbage')).toBe(0);
    expect(performanceProfileIndex(null)).toBe(0);
  });
});
