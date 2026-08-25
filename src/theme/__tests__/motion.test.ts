import fs from 'fs';
import path from 'path';
import { rubberBand, clampWithRubberBand, RUBBER_C } from '../motion';

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'motion.ts'), 'utf8');

/** First statement inside the body of the named exported function, trimmed. */
function firstStatementOf(name: string): string {
  const marker = `export function ${name}(`;
  const start = SOURCE.indexOf(marker);
  if (start === -1) throw new Error(`function ${name} not found in motion.ts`);
  const bodyStart = SOURCE.indexOf('{', SOURCE.indexOf(')', start));
  const body = SOURCE.slice(bodyStart + 1);
  return body.split('\n').map((l) => l.trim()).filter(Boolean)[0];
}

describe('rubberBand', () => {
  it('returns 0 at zero distance', () => {
    expect(rubberBand(0, 400)).toBe(0);
  });

  it('is strictly increasing in distance', () => {
    const dim = 400;
    let previous = rubberBand(0, dim);
    for (const d of [1, 10, 50, 100, 400, 1000]) {
      const current = rubberBand(d, dim);
      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
  });

  it('is sublinear: doubling the distance gives less than double the offset', () => {
    const dim = 400;
    for (const d of [1, 10, 100, 800]) {
      expect(rubberBand(2 * d, dim)).toBeLessThan(2 * rubberBand(d, dim));
    }
  });

  it('never exceeds the dimension / RUBBER_C asymptote', () => {
    const dim = 400;
    const ceiling = dim / RUBBER_C;
    for (const d of [1, 1e3, 1e6, 1e12]) {
      expect(rubberBand(d, dim)).toBeLessThan(ceiling);
    }
    expect(rubberBand(1e12, dim)).toBeCloseTo(ceiling, 2);
  });

  it('stays below the distance itself (it damps, never amplifies)', () => {
    const dim = 400;
    for (const d of [1, 10, 100, 1000]) {
      expect(rubberBand(d, dim)).toBeLessThan(d);
    }
  });

  it('returns 0 for dimension 0 or negative, without NaN or Infinity', () => {
    for (const dim of [0, -1, -400]) {
      const result = rubberBand(100, dim);
      expect(result).toBe(0);
      expect(Number.isNaN(result)).toBe(false);
      expect(Number.isFinite(result)).toBe(true);
    }
  });

  it('returns 0 for negative distance instead of amplifying backwards', () => {
    expect(rubberBand(-100, 400)).toBe(0);
  });

  it('returns 0 (not NaN) for NaN inputs', () => {
    expect(rubberBand(NaN, 400)).toBe(0);
    expect(rubberBand(100, NaN)).toBe(0);
  });

  it('is finite for an absurdly large distance', () => {
    expect(Number.isFinite(rubberBand(Number.MAX_SAFE_INTEGER, 400))).toBe(true);
  });

  it('scales with dimension: a larger viewport resists less at the same distance', () => {
    expect(rubberBand(100, 800)).toBeGreaterThan(rubberBand(100, 200));
  });

  it('declares the worklet directive as its first statement', () => {
    // Read the production source: the babel worklet plugin strips the literal
    // directive from the compiled function body, so toString() cannot see it.
    expect(firstStatementOf('rubberBand')).toBe("'worklet';");
  });
});

describe('clampWithRubberBand', () => {
  const dim = 400;

  it('returns the value untouched inside the range, including the exact bounds', () => {
    for (const v of [0, 1, 50, 99, 100]) {
      expect(clampWithRubberBand(v, 0, 100, dim)).toBe(v);
    }
  });

  it('returns the value untouched when min === max and value equals it', () => {
    expect(clampWithRubberBand(5, 5, 5, dim)).toBe(5);
  });

  it('damps below min: result sits between the raw value and min', () => {
    const result = clampWithRubberBand(-100, 0, 100, dim);
    expect(result).toBeLessThan(0);
    expect(result).toBeGreaterThan(-100);
    expect(result).toBeCloseTo(-rubberBand(100, dim), 10);
  });

  it('damps above max: result sits between max and the raw value', () => {
    const result = clampWithRubberBand(300, 0, 100, dim);
    expect(result).toBeGreaterThan(100);
    expect(result).toBeLessThan(300);
    expect(result).toBeCloseTo(100 + rubberBand(200, dim), 10);
  });

  it('is symmetric around the two bounds for the same overshoot', () => {
    const over = clampWithRubberBand(100 + 70, 0, 100, dim) - 100;
    const under = 0 - clampWithRubberBand(0 - 70, 0, 100, dim);
    expect(over).toBeCloseTo(under, 10);
  });

  it('is idempotent-safe: re-clamping an already damped value keeps it inside', () => {
    const once = clampWithRubberBand(500, 0, 100, dim);
    const twice = clampWithRubberBand(once, 0, 100, dim);
    expect(twice).toBeGreaterThan(100);
    expect(twice).toBeLessThanOrEqual(once);
  });

  it('collapses to a hard clamp when dimension is 0 (no NaN)', () => {
    expect(clampWithRubberBand(-100, 0, 100, 0)).toBe(0);
    expect(clampWithRubberBand(300, 0, 100, 0)).toBe(100);
  });

  it('handles negative ranges', () => {
    expect(clampWithRubberBand(-50, -100, -10, dim)).toBe(-50);
    expect(clampWithRubberBand(-200, -100, -10, dim)).toBeGreaterThan(-200);
  });

  it('declares the worklet directive as its first statement', () => {
    expect(firstStatementOf('clampWithRubberBand')).toBe("'worklet';");
  });
});
