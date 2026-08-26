import { computeHomeGridLayout, freeCellCount, spanFor, WIDGET_CELL_SPAN } from '../homeGridLayout';
import type { WidgetInstance } from '../widgetInstances';

// #935 — one grid instead of two.
//
// The home screen drew widgets in a separate View ABOVE the icons, each one half
// the screen wide whatever its size, with the icon grid starting underneath. So
// nothing "around" a widget could adapt: icons were never displaced by one,
// there was a block on top and icons began below it. "Draggable, and the things
// around it have to adapt" was not a tuning problem — there was no model in
// which it could happen.
//
// These tests are the model. The packer is pure, so every rule is exercised
// without mounting a pager.

function widget(over: Partial<WidgetInstance> = {}): WidgetInstance {
  return { id: 'w1', type: 'battery', size: 'small', page: 0, col: 0, row: 0, ...over };
}

/** 4 columns x 6 rows — the default density. */
const GRID = { cols: 4, rows: 6 };

describe('spans', () => {
  it('small is 2x2, medium 4x2, large 4x4 icon cells', () => {
    // The iOS correspondence, and what the reference screenshot shows.
    expect(WIDGET_CELL_SPAN.small).toEqual({ cols: 2, rows: 2 });
    expect(WIDGET_CELL_SPAN.medium).toEqual({ cols: 4, rows: 2 });
    expect(WIDGET_CELL_SPAN.large).toEqual({ cols: 4, rows: 4 });
  });

  it('clamps a span wider than the grid instead of making the widget unplaceable', () => {
    // Column count is a user setting (#503): a medium wants 4 and the user may
    // be on 3. A widget wider than the grid would vanish silently otherwise.
    expect(spanFor('medium', 3)).toEqual({ cols: 3, rows: 2 });
    expect(spanFor('large', 2)).toEqual({ cols: 2, rows: 4 });
  });

  it('never clamps below one cell', () => {
    expect(spanFor('large', 0)).toEqual({ cols: 1, rows: 4 });
  });
});

describe('two small widgets side by side', () => {
  it('together fill the four columns, as on the reference', () => {
    const layout = computeHomeGridLayout({
      ...GRID,
      widgets: [widget({ id: 'a', col: 0, row: 0 }), widget({ id: 'b', col: 2, row: 0 })],
      items: [],
    });
    const [a, b] = layout[0].widgets;
    expect(a.col + a.colSpan).toBe(2);
    expect(b.col).toBe(2);
    expect(b.col + b.colSpan).toBe(4);
    expect(a.row).toBe(b.row);
  });
});

describe('icons around a widget', () => {
  it('the first icon starts to the RIGHT of a small widget, not at column 0', () => {
    // The issue's red step: today the widget occupies no cell at all and the
    // first icon sits in column 0.
    const layout = computeHomeGridLayout({
      ...GRID,
      widgets: [widget({ col: 0, row: 0 })],
      items: ['a', 'b', 'c'],
    });
    expect(layout[0].items[0]).toMatchObject({ col: 2, row: 0 });
  });

  it('keeps the icons in order', () => {
    const layout = computeHomeGridLayout({ ...GRID, widgets: [widget()], items: ['a', 'b', 'c', 'd'] });
    expect(layout[0].items.map((i) => i.item)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('fills row-major, so a row completes before the next begins', () => {
    const layout = computeHomeGridLayout({ ...GRID, widgets: [], items: ['a', 'b', 'c', 'd', 'e'] });
    expect(layout[0].items.slice(0, 4).map((i) => i.row)).toEqual([0, 0, 0, 0]);
    expect(layout[0].items[4]).toMatchObject({ col: 0, row: 1 });
  });

  it('flows under a widget once its rows are past', () => {
    // A small widget covers rows 0-1 of columns 0-1. So rows 0 and 1 offer only
    // columns 2-3 — four cells — and the fifth icon is the first that can sit in
    // column 0, on row 2, under the widget. That is the reflow: the icons are
    // displaced by the widget and then close back underneath it.
    const layout = computeHomeGridLayout({
      ...GRID,
      widgets: [widget({ col: 0, row: 0 })],
      items: Array.from({ length: 8 }, (_, i) => `i${i}`),
    });
    expect(layout[0].items.slice(0, 4).map((i) => `${i.col},${i.row}`)).toEqual([
      '2,0', '3,0', '2,1', '3,1',
    ]);
    const row2 = layout[0].items.filter((i) => i.row === 2).map((i) => i.col);
    expect(row2).toEqual([0, 1, 2, 3]);
  });

  it('a medium widget takes the whole width, so no icon shares its rows', () => {
    const layout = computeHomeGridLayout({
      ...GRID,
      widgets: [widget({ size: 'medium', col: 0, row: 0 })],
      items: ['a'],
    });
    expect(layout[0].items[0].row).toBe(2);
  });
});

describe('overflow to the next page', () => {
  it('a page with a widget holds fewer icons, and the rest move on', () => {
    // The part that breaks everything quietly if it is got wrong: paging on a
    // fixed cols*rows stops being true the moment a widget exists.
    const items = Array.from({ length: 24 }, (_, i) => `i${i}`);
    const layout = computeHomeGridLayout({
      ...GRID,
      widgets: [widget({ size: 'medium', col: 0, row: 0 })],
      items,
    });
    expect(layout[0].items).toHaveLength(16); // 24 cells - 8 taken by the widget
    expect(layout[1].items).toHaveLength(8);
  });

  it('loses no icon and duplicates none', () => {
    const items = Array.from({ length: 50 }, (_, i) => `i${i}`);
    const layout = computeHomeGridLayout({
      ...GRID,
      widgets: [widget({ size: 'large' }), widget({ id: 'w2', size: 'small', page: 1 })],
      items,
    });
    const placed = layout.flatMap((p) => p.items.map((i) => i.item));
    expect(placed).toEqual(items);
  });

  it('never places two things in the same cell, on any page', () => {
    const layout = computeHomeGridLayout({
      ...GRID,
      widgets: [widget({ size: 'small' }), widget({ id: 'w2', size: 'medium', col: 0, row: 2 })],
      items: Array.from({ length: 40 }, (_, i) => `i${i}`),
    });
    for (const page of layout) {
      const seen = new Set<string>();
      for (const w of page.widgets) {
        for (let r = w.row; r < w.row + w.rowSpan; r++) {
          for (let c = w.col; c < w.col + w.colSpan; c++) {
            expect(seen.has(`${c},${r}`)).toBe(false);
            seen.add(`${c},${r}`);
          }
        }
      }
      for (const i of page.items) {
        expect(seen.has(`${i.col},${i.row}`)).toBe(false);
        seen.add(`${i.col},${i.row}`);
      }
    }
  });
});

describe('widget pages', () => {
  it('honours the page a widget declares', () => {
    const layout = computeHomeGridLayout({ ...GRID, widgets: [widget({ page: 2 })], items: [] });
    expect(layout).toHaveLength(3);
    expect(layout[0].widgets).toHaveLength(0);
    expect(layout[2].widgets).toHaveLength(1);
  });

  it('a page holding only widgets is valid and is not dropped', () => {
    const layout = computeHomeGridLayout({ ...GRID, widgets: [widget({ page: 1 })], items: [] });
    expect(layout[1].widgets).toHaveLength(1);
    expect(layout[1].items).toHaveLength(0);
  });

  it('#936: a widget-only page survives when its page index is required', () => {
    // Page 1 holds ONLY a widget. Icons fill page 0 (they fit there), so the
    // widget-only page 1 must still be returned and must not be pruned to
    // page 0. The layout derives pages from widgets + items, never icon-only,
    // so a widget with no icons on its page survives.
    const layout = computeHomeGridLayout({
      ...GRID,
      widgets: [widget({ id: 'a', page: 1 })],
      items: ['p0a', 'p0b', 'p0c'],
    });
    expect(layout.length).toBeGreaterThanOrEqual(2);
    expect(layout[1].widgets).toHaveLength(1);
    expect(layout[0].items.map((i) => i.item)).toEqual(['p0a', 'p0b', 'p0c']);
  });

  it('always returns at least one page, so the pager never has zero children', () => {
    expect(computeHomeGridLayout({ ...GRID, widgets: [], items: [] })).toHaveLength(1);
  });
});

describe('a stored position that no longer fits', () => {
  it('moves a widget rather than dropping it when the grid got narrower', () => {
    // Losing a widget silently is the worst available outcome: the user placed
    // it, nothing tells them it is gone, and the config still contains it.
    const layout = computeHomeGridLayout({
      cols: 2,
      rows: 6,
      widgets: [widget({ col: 3, row: 0 })],
      items: [],
    });
    expect(layout[0].widgets).toHaveLength(1);
    expect(layout[0].widgets[0].col).toBe(0);
  });

  it('moves the second of two widgets that claim the same cell', () => {
    const layout = computeHomeGridLayout({
      ...GRID,
      widgets: [widget({ id: 'a', col: 0, row: 0 }), widget({ id: 'b', col: 0, row: 0 })],
      items: [],
    });
    const [a, b] = layout[0].widgets;
    expect(a).toMatchObject({ col: 0, row: 0 });
    expect(`${b.col},${b.row}`).not.toBe('0,0');
  });

  it('spills a widget to the next page when its own page is full of widgets', () => {
    const layout = computeHomeGridLayout({
      cols: 4,
      rows: 4,
      widgets: [widget({ id: 'a', size: 'large' }), widget({ id: 'b', size: 'small' })],
      items: [],
    });
    expect(layout[0].widgets.map((w) => w.id)).toEqual(['a']);
    expect(layout[1].widgets.map((w) => w.id)).toEqual(['b']);
  });

  it('clamps a negative or fractional stored position instead of propagating it', () => {
    const layout = computeHomeGridLayout({
      ...GRID,
      widgets: [widget({ col: -2, row: 1.7 })],
      items: [],
    });
    expect(layout[0].widgets[0].col).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(layout[0].widgets[0].row)).toBe(true);
  });
});

describe('rowsUsed', () => {
  it('counts the rows a widget spans, not just its top row', () => {
    const layout = computeHomeGridLayout({ ...GRID, widgets: [widget({ size: 'large' })], items: [] });
    expect(layout[0].rowsUsed).toBe(4);
  });

  it('is zero for an empty page', () => {
    expect(computeHomeGridLayout({ ...GRID, widgets: [], items: [] })[0].rowsUsed).toBe(0);
  });

  it('accounts for icons below a widget', () => {
    const layout = computeHomeGridLayout({
      ...GRID,
      widgets: [widget({ size: 'medium' })],
      items: ['a'],
    });
    expect(layout[0].rowsUsed).toBe(3);
  });
});

describe('freeCellCount', () => {
  it('reports what is left after widgets and icons', () => {
    const layout = computeHomeGridLayout({
      ...GRID,
      widgets: [widget({ size: 'medium' })],
      items: ['a', 'b'],
    });
    expect(freeCellCount(layout[0], 4, 6)).toBe(24 - 8 - 2);
  });

  it('never goes negative', () => {
    const layout = computeHomeGridLayout({ cols: 1, rows: 1, widgets: [], items: ['a'] });
    expect(freeCellCount(layout[0], 1, 1)).toBe(0);
  });
});
