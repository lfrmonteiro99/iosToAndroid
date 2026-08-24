import {
  evaluateCondition,
  evaluateRule,
  pickActiveRule,
  normalizeContextRules,
  haversineDistanceMeters,
  type ContextRule,
  type ContextSnapshot,
} from '../contextTriggerEngine';

const OFFICE = { latitude: 38.7223, longitude: -9.1393 };
const FAR_AWAY = { latitude: -33.8688, longitude: 151.2093 }; // Sydney

function snapshot(overrides: Partial<ContextSnapshot> = {}): ContextSnapshot {
  return {
    wifiSsid: null,
    bluetoothPairedAddresses: [],
    location: null,
    now: new Date(2026, 0, 5, 10, 0, 0), // Monday 10:00
    ...overrides,
  };
}

describe('contextTriggerEngine — evaluateCondition', () => {
  it('wifi: matches only when connected to the exact SSID', () => {
    const cond = { type: 'wifi' as const, ssid: 'Office-5G' };
    expect(evaluateCondition(cond, snapshot({ wifiSsid: 'Office-5G' }))).toBe(true);
    expect(evaluateCondition(cond, snapshot({ wifiSsid: 'Home' }))).toBe(false);
    expect(evaluateCondition(cond, snapshot({ wifiSsid: null }))).toBe(false);
  });

  it('bluetooth: matches when the address is in the paired list', () => {
    const cond = { type: 'bluetooth' as const, address: 'AA:BB:CC:DD:EE:FF' };
    expect(
      evaluateCondition(cond, snapshot({ bluetoothPairedAddresses: ['AA:BB:CC:DD:EE:FF'] })),
    ).toBe(true);
    expect(evaluateCondition(cond, snapshot({ bluetoothPairedAddresses: [] }))).toBe(false);
    expect(
      evaluateCondition(cond, snapshot({ bluetoothPairedAddresses: ['00:00:00:00:00:00'] })),
    ).toBe(false);
  });

  it('location: matches within the radius, not outside it', () => {
    const cond = { type: 'location' as const, ...OFFICE, radiusMeters: 150 };
    expect(evaluateCondition(cond, snapshot({ location: OFFICE }))).toBe(true);
    expect(evaluateCondition(cond, snapshot({ location: FAR_AWAY }))).toBe(false);
    expect(evaluateCondition(cond, snapshot({ location: null }))).toBe(false);
  });

  it('location: a non-positive radius never matches, even at the exact point', () => {
    const cond = { type: 'location' as const, ...OFFICE, radiusMeters: 0 };
    expect(evaluateCondition(cond, snapshot({ location: OFFICE }))).toBe(false);
  });

  it('time: matches inside [start, end), rejects outside', () => {
    const cond = { type: 'time' as const, start: '09:00', end: '18:00', weekdays: [] };
    expect(evaluateCondition(cond, snapshot({ now: new Date(2026, 0, 5, 9, 0, 0) }))).toBe(true);
    expect(evaluateCondition(cond, snapshot({ now: new Date(2026, 0, 5, 17, 59, 0) }))).toBe(true);
    expect(evaluateCondition(cond, snapshot({ now: new Date(2026, 0, 5, 18, 0, 0) }))).toBe(false);
    expect(evaluateCondition(cond, snapshot({ now: new Date(2026, 0, 5, 8, 59, 0) }))).toBe(false);
  });

  it('time: an overnight window crosses midnight correctly', () => {
    const cond = { type: 'time' as const, start: '22:00', end: '07:00', weekdays: [] };
    expect(evaluateCondition(cond, snapshot({ now: new Date(2026, 0, 5, 23, 0, 0) }))).toBe(true);
    expect(evaluateCondition(cond, snapshot({ now: new Date(2026, 0, 5, 6, 59, 0) }))).toBe(true);
    expect(evaluateCondition(cond, snapshot({ now: new Date(2026, 0, 5, 12, 0, 0) }))).toBe(false);
  });

  it('time: empty weekdays means every day, non-empty filters by day of week', () => {
    const monday = new Date(2026, 0, 5, 10, 0, 0); // Monday
    const withoutFilter = { type: 'time' as const, start: '09:00', end: '18:00', weekdays: [] };
    expect(evaluateCondition(withoutFilter, snapshot({ now: monday }))).toBe(true);

    const mondayOnly = { type: 'time' as const, start: '09:00', end: '18:00', weekdays: [1] };
    expect(evaluateCondition(mondayOnly, snapshot({ now: monday }))).toBe(true);

    const weekendOnly = { type: 'time' as const, start: '09:00', end: '18:00', weekdays: [0, 6] };
    expect(evaluateCondition(weekendOnly, snapshot({ now: monday }))).toBe(false);
  });

  it('time: an unparseable window never matches', () => {
    const cond = { type: 'time' as const, start: 'nope', end: '18:00', weekdays: [] };
    expect(evaluateCondition(cond, snapshot())).toBe(false);
  });
});

function makeRule(overrides: Partial<ContextRule> = {}): ContextRule {
  return {
    id: 'r1',
    name: 'Test rule',
    enabled: true,
    combinator: 'AND',
    conditions: [{ type: 'wifi', ssid: 'Office-5G' }],
    targetMode: 'work',
    ...overrides,
  };
}

describe('contextTriggerEngine — evaluateRule', () => {
  it('AND requires every condition to hold', () => {
    const rule = makeRule({
      combinator: 'AND',
      conditions: [
        { type: 'wifi', ssid: 'Office-5G' },
        { type: 'time', start: '09:00', end: '18:00', weekdays: [] },
      ],
    });
    expect(
      evaluateRule(rule, snapshot({ wifiSsid: 'Office-5G', now: new Date(2026, 0, 5, 10, 0, 0) })),
    ).toBe(true);
    expect(
      evaluateRule(rule, snapshot({ wifiSsid: 'Home', now: new Date(2026, 0, 5, 10, 0, 0) })),
    ).toBe(false);
    expect(
      evaluateRule(rule, snapshot({ wifiSsid: 'Office-5G', now: new Date(2026, 0, 5, 20, 0, 0) })),
    ).toBe(false);
  });

  it('OR requires at least one condition to hold', () => {
    const rule = makeRule({
      combinator: 'OR',
      conditions: [
        { type: 'wifi', ssid: 'Office-5G' },
        { type: 'bluetooth', address: 'AA:BB:CC:DD:EE:FF' },
      ],
    });
    expect(evaluateRule(rule, snapshot({ wifiSsid: 'Office-5G' }))).toBe(true);
    expect(
      evaluateRule(rule, snapshot({ bluetoothPairedAddresses: ['AA:BB:CC:DD:EE:FF'] })),
    ).toBe(true);
    expect(evaluateRule(rule, snapshot())).toBe(false);
  });

  it('a disabled rule never fires, even if conditions hold', () => {
    const rule = makeRule({ enabled: false });
    expect(evaluateRule(rule, snapshot({ wifiSsid: 'Office-5G' }))).toBe(false);
  });

  it('a rule with no conditions never fires, for either combinator', () => {
    expect(evaluateRule(makeRule({ combinator: 'AND', conditions: [] }), snapshot())).toBe(false);
    expect(evaluateRule(makeRule({ combinator: 'OR', conditions: [] }), snapshot())).toBe(false);
  });
});

describe('contextTriggerEngine — pickActiveRule', () => {
  it('returns the first enabled rule (priority = array order) that matches', () => {
    const first = makeRule({ id: 'a', targetMode: 'sleep', conditions: [{ type: 'wifi', ssid: 'Home' }] });
    const second = makeRule({ id: 'b', targetMode: 'work', conditions: [{ type: 'wifi', ssid: 'Office-5G' }] });
    const result = pickActiveRule([first, second], snapshot({ wifiSsid: 'Office-5G' }));
    expect(result?.id).toBe('b');
  });

  it('skips disabled rules even when their conditions match', () => {
    const disabled = makeRule({ id: 'a', enabled: false });
    const enabled = makeRule({ id: 'b', targetMode: 'personal' });
    const result = pickActiveRule([disabled, enabled], snapshot({ wifiSsid: 'Office-5G' }));
    expect(result?.id).toBe('b');
  });

  it('returns null when no rule matches', () => {
    expect(pickActiveRule([makeRule()], snapshot({ wifiSsid: 'Home' }))).toBeNull();
  });

  it('returns null for an empty rule list', () => {
    expect(pickActiveRule([], snapshot())).toBeNull();
  });
});

describe('contextTriggerEngine — normalizeContextRules', () => {
  it('keeps a well-formed rule as-is', () => {
    const rule = makeRule();
    expect(normalizeContextRules([rule])).toEqual([rule]);
  });

  it('non-array input becomes an empty list', () => {
    expect(normalizeContextRules(null)).toEqual([]);
    expect(normalizeContextRules(undefined)).toEqual([]);
    expect(normalizeContextRules('garbage')).toEqual([]);
    expect(normalizeContextRules({})).toEqual([]);
  });

  it('drops a rule missing an id', () => {
    const rule = makeRule();
    const { id: _id, ...withoutId } = rule;
    expect(normalizeContextRules([withoutId])).toEqual([]);
  });

  it('drops a rule with an invalid targetMode (no safe destination to guess)', () => {
    const rule = { ...makeRule(), targetMode: 'nonsense' };
    expect(normalizeContextRules([rule])).toEqual([]);
  });

  it('defaults an invalid combinator to AND', () => {
    const rule = { ...makeRule(), combinator: 'XOR' };
    expect(normalizeContextRules([rule])[0].combinator).toBe('AND');
  });

  it('drops individual malformed conditions but keeps the rule if others survive', () => {
    const rule = makeRule({
      conditions: [
        { type: 'wifi', ssid: 'Office-5G' },
        { type: 'wifi', ssid: '' }, // malformed: empty ssid
        { type: 'bogus' } as unknown as ContextRule['conditions'][number],
      ],
    });
    const result = normalizeContextRules([rule]);
    expect(result).toHaveLength(1);
    expect(result[0].conditions).toEqual([{ type: 'wifi', ssid: 'Office-5G' }]);
  });

  it('drops a rule entirely when every condition is malformed', () => {
    const rule = makeRule({ conditions: [{ type: 'wifi', ssid: '' }] });
    expect(normalizeContextRules([rule])).toEqual([]);
  });

  it('drops entries that are not objects', () => {
    expect(normalizeContextRules([null, 42, 'x', makeRule()])).toEqual([makeRule()]);
  });

  it('treats a missing enabled field as enabled (matches Boolean !== false)', () => {
    const rule = makeRule();
    const { enabled: _enabled, ...withoutEnabled } = rule;
    expect(normalizeContextRules([withoutEnabled])[0].enabled).toBe(true);
  });

  it('location condition: drops non-finite or non-positive radius', () => {
    const rule = makeRule({
      conditions: [{ type: 'location', latitude: 1, longitude: 1, radiusMeters: 0 }],
    });
    expect(normalizeContextRules([rule])).toEqual([]);
  });

  it('time condition: dedupes and sorts weekdays, drops out-of-range values', () => {
    const rule = makeRule({
      conditions: [{ type: 'time', start: '09:00', end: '18:00', weekdays: [3, 1, 1, 9, -1] }],
    });
    expect(normalizeContextRules([rule])[0].conditions[0]).toEqual({
      type: 'time',
      start: '09:00',
      end: '18:00',
      weekdays: [1, 3],
    });
  });
});

describe('contextTriggerEngine — haversineDistanceMeters', () => {
  it('is zero for identical points', () => {
    expect(haversineDistanceMeters(38.7223, -9.1393, 38.7223, -9.1393)).toBe(0);
  });

  it('is large (thousands of km) between distant continents', () => {
    const d = haversineDistanceMeters(OFFICE.latitude, OFFICE.longitude, FAR_AWAY.latitude, FAR_AWAY.longitude);
    expect(d).toBeGreaterThan(10_000_000);
  });
});
