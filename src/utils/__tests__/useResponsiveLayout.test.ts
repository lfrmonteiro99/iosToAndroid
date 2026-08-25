import { detectLayout, REGULAR_WIDTH_BREAKPOINT } from '../useResponsiveLayout';

describe('detectLayout (spec §24 — Responsive/tablet layout)', () => {
  it('treats zero, negative and non-finite widths as compact', () => {
    expect(detectLayout(0)).toBe('compact');
    expect(detectLayout(-10)).toBe('compact');
    expect(detectLayout(NaN)).toBe('compact');
    expect(detectLayout(Infinity)).toBe('compact');
  });

  it('stays compact one pixel below the breakpoint', () => {
    expect(detectLayout(REGULAR_WIDTH_BREAKPOINT - 1)).toBe('compact');
    expect(detectLayout(767)).toBe('compact');
  });

  it('switches to regular exactly at the breakpoint (iPad portrait width)', () => {
    expect(detectLayout(REGULAR_WIDTH_BREAKPOINT)).toBe('regular');
    expect(detectLayout(768)).toBe('regular');
    expect(detectLayout(820)).toBe('regular');
    expect(detectLayout(1024)).toBe('regular');
  });

  it('honours a custom breakpoint', () => {
    expect(detectLayout(499, 500)).toBe('compact');
    expect(detectLayout(500, 500)).toBe('regular');
    expect(detectLayout(1024, 500)).toBe('regular');
  });
});
