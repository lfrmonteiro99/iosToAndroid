import {
  classifyNotification,
  resolveBaseTier,
  DEFAULT_APP_TIERS,
  AppRule,
  NotificationTier,
} from '../notificationRouter';

// Boundaries & empty: empty allow-list, empty app rules, unknown package.
describe('resolveBaseTier', () => {
  it('falls back to immediate for an unknown package (router-disabled-safe)', () => {
    const r = resolveBaseTier('com.some.unknown.app', []);
    expect(r).toEqual({ tier: 'immediate', source: 'fallback', explicit: false });
  });

  it('returns a built-in default tier for known packages', () => {
    expect(resolveBaseTier('com.whatsapp').tier).toBe('immediate');
    expect(resolveBaseTier('com.reddit.frontpage').tier).toBe('digest');
    expect(resolveBaseTier('com.google.android.gm').tier).toBe('scheduled');
  });

  it('respects an explicit per-app override over the built-in default', () => {
    const rules: AppRule[] = [{ packageName: 'com.reddit.frontpage', tier: 'immediate' }];
    const r = resolveBaseTier('com.reddit.frontpage', rules);
    expect(r).toEqual({ tier: 'immediate', source: 'appRule', explicit: true });
  });

  it('first matching rule wins when several name the same package', () => {
    const rules: AppRule[] = [
      { packageName: 'com.dupe.app', tier: 'blocked' },
      { packageName: 'com.dupe.app', tier: 'digest' },
    ];
    expect(resolveBaseTier('com.dupe.app', rules).tier).toBe('blocked');
  });

  it('package-name match is case-sensitive (Android ids are)', () => {
    // 'com.WhatsApp' must NOT match the built-in 'com.whatsapp'.
    expect(resolveBaseTier('com.WhatsApp').tier).toBe('immediate');
    expect(resolveBaseTier('com.whatsapp').tier).toBe('immediate');
  });

  it('handles an empty / malformed appRules array without throwing', () => {
    expect(resolveBaseTier('com.whatsapp', []).tier).toBe('immediate');
    // @ts-expect-error deliberately malformed input
    expect(resolveBaseTier('com.whatsapp', null).tier).toBe('immediate');
  });
});

describe('classifyNotification — router disabled', () => {
  it('routes everything immediate when the router is off, regardless of package', () => {
    const d = classifyNotification({
      packageName: 'com.reddit.frontpage',
      routerEnabled: false,
    });
    expect(d).toEqual({ tier: 'immediate', source: 'disabled' });
  });
});

describe('classifyNotification — normal routing', () => {
  it('uses an explicit app rule', () => {
    const d = classifyNotification({
      packageName: 'com.reddit.frontpage',
      routerEnabled: true,
      appRules: [{ packageName: 'com.reddit.frontpage', tier: 'immediate' }],
    });
    expect(d).toEqual({ tier: 'immediate', source: 'appRule' });
  });

  it('uses the built-in default when no override exists', () => {
    const d = classifyNotification({
      packageName: 'com.reddit.frontpage',
      routerEnabled: true,
    });
    expect(d).toEqual({ tier: 'digest', source: 'default' });
  });

  it('falls back to immediate for packages with no rule or default', () => {
    const d = classifyNotification({
      packageName: 'com.unknownsender.app',
      routerEnabled: true,
    });
    expect(d).toEqual({ tier: 'immediate', source: 'fallback' });
  });

  // The inverse of the fix: a blocked app must STAY blocked.
  it('keeps a blocked app blocked (never promoted by default)', () => {
    const d = classifyNotification({
      packageName: 'com.spam.app',
      routerEnabled: true,
      appRules: [{ packageName: 'com.spam.app', tier: 'blocked' }],
    });
    expect(d).toEqual({ tier: 'blocked', source: 'appRule' });
  });
});

describe('classifyNotification — Reduce Interruptions', () => {
  it('holds a non-exempt notification for the digest/summary', () => {
    const d = classifyNotification({
      packageName: 'com.reddit.frontpage',
      routerEnabled: true,
      reduceInterruptionsEnabled: true,
      reduceInterruptionsAllowList: [],
    });
    expect(d).toEqual({ tier: 'digest', source: 'reduceInterruptions' });
  });

  it('lets a scheduled-default app through the summary too (not immediate)', () => {
    const d = classifyNotification({
      packageName: 'com.google.android.gm',
      routerEnabled: true,
      reduceInterruptionsEnabled: true,
    });
    expect(d.tier).toBe('digest');
    expect(d.source).toBe('reduceInterruptions');
  });

  it('exempts an app on the allow-list', () => {
    const d = classifyNotification({
      packageName: 'com.reddit.frontpage',
      routerEnabled: true,
      reduceInterruptionsEnabled: true,
      reduceInterruptionsAllowList: ['com.reddit.frontpage'],
    });
    expect(d).toEqual({ tier: 'immediate', source: 'allowList' });
  });

  it('exempts an active call even when not allow-listed', () => {
    const d = classifyNotification({
      packageName: 'com.reddit.frontpage',
      isCall: true,
      routerEnabled: true,
      reduceInterruptionsEnabled: true,
      reduceInterruptionsAllowList: [],
    });
    expect(d).toEqual({ tier: 'immediate', source: 'allowList' });
  });

  it('respects an explicit user promotion to immediate under Reduce Interruptions', () => {
    const d = classifyNotification({
      packageName: 'com.reddit.frontpage',
      routerEnabled: true,
      reduceInterruptionsEnabled: true,
      appRules: [{ packageName: 'com.reddit.frontpage', tier: 'immediate' }],
    });
    expect(d).toEqual({ tier: 'immediate', source: 'appRule' });
  });

  it('still blocks a blocked app even under Reduce Interruptions', () => {
    const d = classifyNotification({
      packageName: 'com.spam.app',
      routerEnabled: true,
      reduceInterruptionsEnabled: true,
      appRules: [{ packageName: 'com.spam.app', tier: 'blocked' }],
    });
    expect(d).toEqual({ tier: 'blocked', source: 'appRule' });
  });

  // Empty/invalid allow-list must not accidentally exempt.
  it('treats an empty allow-list as "no exemption"', () => {
    const d = classifyNotification({
      packageName: 'com.reddit.frontpage',
      routerEnabled: true,
      reduceInterruptionsEnabled: true,
      reduceInterruptionsAllowList: [],
    });
    expect(d.tier).toBe('digest');
  });
});

// Contract guard: the documented WhatsApp=Immediate / Reddit=Digest examples
// from the issue must hold, so a future edit that breaks them is caught.
describe('issue contract — documented examples', () => {
  const cases: [string, NotificationTier][] = [
    ['com.whatsapp', 'immediate'],
    ['com.reddit.frontpage', 'digest'],
  ];
  it.each(cases)('%s routes to %s by default', (pkg, expected) => {
    expect(
      classifyNotification({ packageName: pkg, routerEnabled: true }).tier,
    ).toBe(expected);
  });

  it('exposes DEFAULT_APP_TIERS for the documented examples', () => {
    expect(DEFAULT_APP_TIERS['com.whatsapp']).toBe('immediate');
    expect(DEFAULT_APP_TIERS['com.reddit.frontpage']).toBe('digest');
  });
});
