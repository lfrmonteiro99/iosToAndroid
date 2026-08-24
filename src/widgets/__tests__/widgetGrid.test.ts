import {
  computeWidgetGrid,
  gridRowCount,
  SIZE_SPAN,
  GRID_COLUMNS,
  type WidgetSize,
} from '../widgetGrid';

describe('widgetGrid — iOS-style 2-column widget packing', () => {
  it('exposes the three supported sizes with their cell spans', () => {
    expect(SIZE_SPAN.small).toEqual({ w: 1, h: 1 }); // 2x2 cell
    expect(SIZE_SPAN.medium).toEqual({ w: 2, h: 1 }); // 4x2 cell (full width, one row)
    expect(SIZE_SPAN.large).toEqual({ w: 2, h: 2 }); // full width, two rows
  });

  it('uses a 2-column grid', () => {
    expect(GRID_COLUMNS).toBe(2);
  });

  it('returns an empty placement for no widgets', () => {
    expect(computeWidgetGrid([])).toEqual([]);
    expect(gridRowCount(computeWidgetGrid([]))).toBe(0);
  });

  it('packs two small widgets side by side in the same row (2-col)', () => {
    const placed = computeWidgetGrid([
      { id: 'a', size: 'small' },
      { id: 'b', size: 'small' },
    ]);
    expect(placed).toEqual([
      { id: 'a', size: 'small', col: 0, rowStart: 0, rowSpan: 1 },
      { id: 'b', size: 'small', col: 1, rowStart: 0, rowSpan: 1 },
    ]);
    // both fit in a single row
    expect(gridRowCount(placed)).toBe(1);
  });

  it('places a full-width (medium/large) widget alone on its row', () => {
    const placed = computeWidgetGrid([
      { id: 'm', size: 'medium' },
      { id: 's', size: 'small' },
    ]);
    // medium takes the full width at row 0; small drops below it
    expect(placed[0]).toEqual({ id: 'm', size: 'medium', col: 0, rowStart: 0, rowSpan: 1 });
    expect(placed[1].size).toBe('small');
    expect(placed[1].rowStart).toBe(1);
  });

  it('a small widget never sits beside a full-width widget it would overlap', () => {
    const placed = computeWidgetGrid([
      { id: 's', size: 'small' },
      { id: 'm', size: 'medium' },
    ]);
    // small at col0 row0; medium is full width and must start at row1, not row0
    const medium = placed.find((p) => p.id === 'm')!;
    expect(medium.rowStart).toBe(1);
    expect(gridRowCount(placed)).toBe(2);
  });

  it('packs a small pair then a full-width widget without leaving it in the wrong row', () => {
    const placed = computeWidgetGrid([
      { id: 'a', size: 'small' },
      { id: 'b', size: 'small' },
      { id: 'm', size: 'medium' },
    ]);
    expect(placed[2]).toEqual({ id: 'm', size: 'medium', col: 0, rowStart: 1, rowSpan: 1 });
  });

  it('advances the column cursor by the widget height (large spans 2 rows)', () => {
    const placed = computeWidgetGrid([
      { id: 'l', size: 'large' },
      { id: 's', size: 'small' },
    ]);
    const large = placed.find((p) => p.id === 'l')!;
    expect(large.rowStart).toBe(0);
    expect(large.rowSpan).toBe(2);
    // small must sit below the 2-row large, not beside it
    const small = placed.find((p) => p.id === 's')!;
    expect(small.rowStart).toBe(2);
    expect(gridRowCount(placed)).toBe(3);
  });

  it('ties (equal free row) resolve to the left column', () => {
    const placed = computeWidgetGrid([
      { id: 'a', size: 'small' },
      { id: 'b', size: 'small' },
    ]);
    expect(placed[0].col).toBe(0);
    expect(placed[1].col).toBe(1);
  });

  it('preserves the input order', () => {
    const ids = ['w1', 'w2', 'w3', 'w4'];
    const placed = computeWidgetGrid(ids.map((id) => ({ id, size: 'small' as WidgetSize })));
    expect(placed.map((p) => p.id)).toEqual(ids);
  });
});
