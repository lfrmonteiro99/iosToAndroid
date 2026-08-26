import {
  GRID_COLUMNS,
  SIZE_SPAN,
  SIZE_ROW_SPAN,
  DEFAULT_WIDGET_SIZES,
  computeWidgetGrid,
  gridRowCount,
  type WidgetSize,
} from '../widgetGrid';
import type { WidgetType } from '../TodayWidgets';

const ALL: WidgetType[] = ['battery', 'storage', 'weather', 'upNext', 'messages', 'screenTime'];

describe('widgetGrid — pure 2-column packing algorithm', () => {
  it('exposes the documented constants', () => {
    expect(GRID_COLUMNS).toBe(2);
    // small=1x1, medium=2x1, large=2x2
    expect(SIZE_SPAN.small).toBe(1);
    expect(SIZE_SPAN.medium).toBe(2);
    expect(SIZE_SPAN.large).toBe(2);
    expect(SIZE_ROW_SPAN.small).toBe(1);
    expect(SIZE_ROW_SPAN.medium).toBe(1);
    expect(SIZE_ROW_SPAN.large).toBe(2);
  });

  it('the per-type placement default maps each widget type to the issue-specified size', () => {
    const expected: Record<WidgetType, WidgetSize> = {
      battery: 'small',
      storage: 'small',
      weather: 'medium',
      upNext: 'large',
      messages: 'small',
      screenTime: 'small',
    };
    expect(DEFAULT_WIDGET_SIZES).toEqual(expected);
    // every known type has a default
    for (const t of ALL) {
      expect(DEFAULT_WIDGET_SIZES[t]).toBeDefined();
    }
  });

  it('returns no cells for an empty layout', () => {
    expect(computeWidgetGrid([])).toEqual([]);
    expect(gridRowCount(computeWidgetGrid([]))).toBe(0);
  });

  it('places a single small widget at column 0, row 0 (1x1)', () => {
    const [cell] = computeWidgetGrid(['battery']);
    expect(cell.type).toBe('battery');
    expect(cell.size).toBe('small');
    expect(cell.col).toBe(0);
    expect(cell.row).toBe(0);
    expect(cell.colSpan).toBe(1);
    expect(cell.rowSpan).toBe(1);
    expect(gridRowCount(computeWidgetGrid(['battery']))).toBe(1);
  });

  it('pairs two small widgets side by side on the same row', () => {
    const cells = computeWidgetGrid(['battery', 'storage']);
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatchObject({ col: 0, row: 0, colSpan: 1 });
    expect(cells[1]).toMatchObject({ col: 1, row: 0, colSpan: 1 });
    expect(gridRowCount(cells)).toBe(1);
  });

  it('wraps a third small widget to a new row (column boundary +1)', () => {
    const cells = computeWidgetGrid(['battery', 'storage', 'messages']);
    expect(cells[0]).toMatchObject({ col: 0, row: 0 });
    expect(cells[1]).toMatchObject({ col: 1, row: 0 });
    expect(cells[2]).toMatchObject({ col: 0, row: 1 });
    expect(gridRowCount(cells)).toBe(2);
  });

  it('forces a full-width (medium) widget onto its own row, starting at column 0', () => {
    const cells = computeWidgetGrid(['battery', 'weather']);
    expect(cells[0]).toMatchObject({ col: 0, row: 0, colSpan: 1 }); // small
    expect(cells[1]).toMatchObject({ col: 0, row: 1, colSpan: 2, size: 'medium' }); // medium wraps
    expect(gridRowCount(cells)).toBe(2);
  });

  it('gives a large widget a 2-row vertical span', () => {
    const cells = computeWidgetGrid(['battery', 'upNext']);
    expect(cells[0]).toMatchObject({ col: 0, row: 0 });
    expect(cells[1]).toMatchObject({ col: 0, row: 1, colSpan: 2, rowSpan: 2, size: 'large' });
    // small (row 0) + large (rows 1-2) => 3 rows tall
    expect(gridRowCount(cells)).toBe(3);
  });

  it('a large widget preceded by a full small+small pair still starts on a fresh row', () => {
    const cells = computeWidgetGrid(['battery', 'storage', 'upNext']);
    expect(cells[2]).toMatchObject({ col: 0, row: 1, colSpan: 2, rowSpan: 2, size: 'large' });
    expect(gridRowCount(cells)).toBe(3);
  });

  it('default-enabled order packs to the expected column/row map', () => {
    const cells = computeWidgetGrid(ALL);
    // battery+storage pair on row 0; weather spans row 1; upNext spans rows 2-3;
    // messages on row 4 (alone).
    expect(cells.map((c) => `${c.type}@${c.col},${c.row}`)).toEqual([
      'battery@0,0',
      'storage@1,0',
      'weather@0,1',
      'upNext@0,2',
      'messages@0,4',
      'screenTime@1,4',
    ]);
  });

  it('falls back to small for an unknown/absent size instead of throwing', () => {
    const cells = computeWidgetGrid(['battery'], { battery: 'small' } as Record<WidgetType, WidgetSize>);
    expect(cells[0].colSpan).toBe(1);
    // missing type in a partial size map must not crash
    const partial = computeWidgetGrid(['battery', 'weather'], { battery: 'large' } as Record<WidgetType, WidgetSize>);
    expect(partial[1].size).toBe('small'); // weather absent -> default small
  });
});
