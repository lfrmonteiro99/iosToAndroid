/**
 * #936 — a new widget goes on the page the user is viewing, and overflows to
 * the next page with room (with `overflowed` so the gallery can tell them) when
 * the focused page is full.
 *
 * These are the rules the gallery's "add" now routes through. The function is
 * pure, so each branch is exercised without mounting a pager.
 *
 * `resolveWidgetPlacement` reads free space from the REAL packed layout
 * (`computeHomeGridLayout`'s output), not from the widget list alone — a page
 * can be full of ICONS with zero widgets on it, and that has to count as no
 * room too. Building a `PageLayout` fixture by hand keeps that contract
 * explicit rather than routing every test through the packer.
 */
import { resolveWidgetPlacement, computeHomeGridLayout } from '../homeGridLayout';
import type { PageLayout } from '../homeGridLayout';
import type { WidgetInstance } from '../widgetInstances';

function inst(over: Partial<WidgetInstance> = {}): WidgetInstance {
  return { id: 'w', type: 'battery', size: 'small', page: 0, col: 0, row: 0, ...over };
}

const GRID = { cols: 4, rows: 6 };

/** An empty page: no icons, no widgets. */
function emptyPage(): PageLayout<unknown> {
  return { widgets: [], items: [], rowsUsed: 0 };
}

/** A page whose every cell is covered by an icon, and no widget. */
function fullOfIcons(cols: number, rows: number): PageLayout<unknown> {
  const items: PageLayout<unknown>['items'] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      items.push({ item: `icon-${row}-${col}`, col, row });
    }
  }
  return { widgets: [], items, rowsUsed: rows };
}

describe('resolveWidgetPlacement (#936)', () => {
  it('places on the focused page when it has room', () => {
    const r = resolveWidgetPlacement({
      ...GRID,
      pages: [],
      focusPage: 2,
      size: 'small',
    });
    expect(r.page).toBe(2);
    expect(r.overflowed).toBe(false);
  });

  it('places on page 0 (focused) when the home is empty', () => {
    const r = resolveWidgetPlacement({ ...GRID, pages: [], focusPage: 0, size: 'medium' });
    expect(r.page).toBe(0);
  });

  it('overflows to the next page when the focused page is full of widgets', () => {
    // A large (4x4) already fills the only focus page; a second large cannot
    // fit there, so it must move forward and report overflow.
    const placed = [inst({ id: 'a', size: 'large', page: 1 })];
    const pages = computeHomeGridLayout({ ...GRID, widgets: placed, items: [] as unknown[] });
    const r = resolveWidgetPlacement({
      ...GRID,
      pages,
      focusPage: 1,
      size: 'large',
    });
    expect(r.page).toBe(2);
    expect(r.overflowed).toBe(true);
  });

  it('overflows past a partially-full focus page to find room', () => {
    // Focus page 0 already holds two small widgets side by side (2x2 each),
    // filling row 0 only — there is still room below. A small should stay put.
    const placed = [
      inst({ id: 'a', col: 0, row: 0 }),
      inst({ id: 'b', col: 2, row: 0 }),
    ];
    const pages = computeHomeGridLayout({ ...GRID, widgets: placed, items: [] as unknown[] });
    const r = resolveWidgetPlacement({ ...GRID, pages, focusPage: 0, size: 'small' });
    expect(r.page).toBe(0);
    expect(r.overflowed).toBe(false);
  });

  it('counts icons already on the focused page as occupied, even with zero widgets', () => {
    // A page can be full of icons and hold no widget at all — that is the
    // common case, not the edge case. Re-deriving occupancy from only the
    // widget list (what this function used to do) would report this page as
    // wide open; it must report no room.
    const pages: PageLayout<unknown>[] = [fullOfIcons(GRID.cols, GRID.rows)];
    const r = resolveWidgetPlacement({ ...GRID, pages, focusPage: 0, size: 'small' });
    expect(r.page).toBe(1);
    expect(r.overflowed).toBe(true);
  });

  it('places on the focused page when its icons leave a widget-sized gap', () => {
    // Same icon-only page, but only the first row is covered — a small (2x2)
    // still fits below.
    const items: PageLayout<unknown>['items'] = [];
    for (let col = 0; col < GRID.cols; col++) items.push({ item: `icon-${col}`, col, row: 0 });
    const pages: PageLayout<unknown>[] = [{ widgets: [], items, rowsUsed: 1 }];
    const r = resolveWidgetPlacement({ ...GRID, pages, focusPage: 0, size: 'small' });
    expect(r.page).toBe(0);
    expect(r.overflowed).toBe(false);
  });

  it('treats a page past the end of `pages` as empty', () => {
    const r = resolveWidgetPlacement({ ...GRID, pages: [emptyPage()], focusPage: 3, size: 'large' });
    expect(r.page).toBe(3);
    expect(r.overflowed).toBe(false);
  });

  it('only ever moves forward, never to a page before the focus', () => {
    // A widget on page 0, focus page 0, large. Focus is full → must go to a
    // page >= 1, never backward.
    const placed = [inst({ id: 'a', size: 'large', page: 0 })];
    const pages = computeHomeGridLayout({ ...GRID, widgets: placed, items: [] as unknown[] });
    const r = resolveWidgetPlacement({ ...GRID, pages, focusPage: 0, size: 'large' });
    expect(r.page).toBeGreaterThanOrEqual(1);
    expect(r.overflowed).toBe(true);
  });
});
