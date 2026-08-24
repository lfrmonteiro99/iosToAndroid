import {
  TapClassifier,
  classifyTaps,
  DEFAULT_BACKTAP_OPTIONS,
  BackTapType,
} from '../backTapClassifier';

// ─── Defaults ────────────────────────────────────────────────────────────
// These windows are the shared contract between the JS classifier (this file)
// and the native TapClassifier.kt that runs on the sensor thread. They must
// stay in sync — the Kotlin mirrors them exactly.
describe('back-tap classifier — defaults', () => {
  it('double window is 300ms and triple window is 600ms', () => {
    expect(DEFAULT_BACKTAP_OPTIONS.doubleWindowMs).toBe(300);
    expect(DEFAULT_BACKTAP_OPTIONS.tripleWindowMs).toBe(600);
  });
});

// ─── Functional form: classifyTaps ───────────────────────────────────────
describe('classifyTaps — happy path', () => {
  it('returns null with fewer than 2 taps', () => {
    expect(classifyTaps([])).toBeNull();
    expect(classifyTaps([100])).toBeNull();
  });

  it('recognizes a double tap when 2 taps land within the double window', () => {
    const r = classifyTaps([1000, 1200]); // 200ms apart ≤ 300
    expect(r).not.toBeNull();
    expect(r!.type).toBe('double');
    expect(r!.count).toBe(2);
    expect(r!.taps).toEqual([1000, 1200]);
  });

  it('recognizes a triple tap when 3 taps land within the triple window', () => {
    const r = classifyTaps([1000, 1100, 1200]); // span 200ms ≤ 600
    expect(r).not.toBeNull();
    expect(r!.type).toBe('triple');
    expect(r!.count).toBe(3);
    expect(r!.taps).toEqual([1000, 1100, 1200]);
  });
});

// ─── Boundaries (the window edges) ───────────────────────────────────────
describe('classifyTaps — boundaries', () => {
  it('does NOT recognize a double 1ms past the double window', () => {
    // 301ms apart > 300ms double window → null (not a false double).
    expect(classifyTaps([1000, 1301])).toBeNull();
  });

  it('does NOT recognize a triple 1ms past the triple window', () => {
    // span(last3) = 601ms > 600ms triple window, and last two are 301ms apart
    // (> double window), so neither double nor triple fires.
    const r = classifyTaps([1000, 1300, 1601]);
    expect(r).toBeNull();
  });

  it('a 3-tap gesture that only spans the double window is still a triple', () => {
    // span(last3) = 250ms ≤ 600 → triple, even though it would also qualify
    // as a double on the last two. Triple wins (more specific).
    const r = classifyTaps([1000, 1100, 1250]);
    expect(r!.type).toBe('triple');
    expect(r!.count).toBe(3);
  });

  it('never emits more than 3 taps — a quadruple collapses to triple (last 3)', () => {
    const r = classifyTaps([1000, 1100, 1200, 1300]); // all within 600ms
    expect(r!.type).toBe('triple');
    expect(r!.count).toBe(3);
    expect(r!.taps).toEqual([1100, 1200, 1300]);
  });
});

// ─── Stale / window pruning ──────────────────────────────────────────────
describe('classifyTaps — staleness pruning', () => {
  it('drops a leading tap that fell outside the window before judging', () => {
    // First tap at 0 is 650ms before the latest (650) → older than the 600ms
    // window, so it is pruned; the remaining [400, 650] are 250ms apart → double.
    const r = classifyTaps([0, 400, 650]);
    expect(r!.type).toBe('double');
    expect(r!.taps).toEqual([400, 650]);
  });

  it('a stale window collapses to nothing when only one tap survives pruning', () => {
    // 0 and 100 both pruned relative to 750 (gap > 600) → only 750 remains → null.
    expect(classifyTaps([0, 100, 750])).toBeNull();
  });
});

// ─── Empty / invalid / hostile inputs ────────────────────────────────────
describe('classifyTaps — invalid input', () => {
  it('returns null when any timestamp is non-finite (hostile / corrupt)', () => {
    expect(classifyTaps([0, NaN, 100])).toBeNull();
    expect(classifyTaps([0, Infinity, 100])).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(classifyTaps([0, 'x' as any, 100])).toBeNull();
  });

  it('returns null for a single tap far after a prior one (gap > double window)', () => {
    // 500ms apart is beyond the 300ms double window → not a double.
    expect(classifyTaps([1000, 1500])).toBeNull();
  });
});

// ─── Configurability (manufacturer / sensitivity variation) ──────────────
describe('classifyTaps — custom options', () => {
  it('honours a tighter double window', () => {
    const opts = { doubleWindowMs: 200, tripleWindowMs: 400 };
    // 250ms apart > 200ms custom double window → null.
    expect(classifyTaps([1000, 1250], opts)).toBeNull();
    // 150ms apart ≤ 200ms → double.
    expect(classifyTaps([1000, 1150], opts)!.type).toBe('double');
  });

  it('honours a wider triple window', () => {
    const opts = { doubleWindowMs: 300, tripleWindowMs: 1500 };
    // span 900ms ≤ 1500ms custom triple window → triple.
    expect(classifyTaps([1000, 1300, 1900], opts)!.type).toBe('triple');
  });
});

// ─── Incremental form: TapClassifier (mirrors native service) ────────────
describe('TapClassifier — incremental', () => {
  it('emits null on the first tap, double on the second within window', () => {
    const c = new TapClassifier();
    expect(c.push(1000)).toBeNull();
    const r = c.push(1150);
    expect(r!.type).toBe('double');
    expect(r!.count).toBe(2);
  });

  it('emits triple on the third tap when within the triple window of the first', () => {
    const c = new TapClassifier();
    expect(c.push(1000)).toBeNull();
    expect(c.push(1100)!.type).toBe('double');
    const r = c.push(1200);
    expect(r!.type).toBe('triple');
    expect(r!.count).toBe(3);
  });

  it('ignores a non-increasing timestamp (stuck-sensor / out-of-order guard)', () => {
    const c = new TapClassifier();
    c.push(1000);
    c.push(1100);
    // Same timestamp again (a glitch, not a real second tap) must be ignored.
    expect(c.push(1100)).toBeNull();
    // The earlier double still stands (the guard did not manufacture a false
    // extra tap), and a later distinct tap within window forms a real triple.
    expect(c.push(1250)!.type).toBe('triple');
  });

  it('prunes stale taps as the clock advances', () => {
    const c = new TapClassifier();
    c.push(0);
    c.push(100);
    // 750ms later: both earlier taps are > 600ms old → pruned, only 750 remains.
    expect(c.push(750)).toBeNull();
  });

  it('reset() clears all accumulated taps', () => {
    const c = new TapClassifier();
    c.push(1000);
    c.push(1100);
    c.reset();
    // After reset a lone tap is back to null (no false double from stale state).
    expect(c.push(2000)).toBeNull();
  });

  it('does not throw and returns null for a non-finite push', () => {
    const c = new TapClassifier();
    expect(() => c.push(NaN)).not.toThrow();
    expect(c.push(NaN)).toBeNull();
  });
});

// Type-level sanity: the exported union is what listeners receive.
describe('BackTapType', () => {
  it('is the union double | triple', () => {
    const t: BackTapType = 'double';
    expect(t).toBe('double');
  });
});
