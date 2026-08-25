// Pure, framework-free 2-column widget packing for the iOS-style Today View
// grid (#652 / #809). No React, no StyleSheet — just data the screen turns
// into a flex row+wrap layout with per-size widths.
//
// Sizing model (the issue's spec):
//   small  = 1x1  -> half width, pairs side-by-side
//   medium = 2x1  -> full width, one row tall
//   large  = 2x2  -> full width, two rows tall (denser content)
//
// The algorithm is a simple left-to-right shelf packer over GRID_COLUMNS
// columns: each widget is placed on the first column of the current row that
// has enough remaining width for its colSpan. A medium/large widget (colSpan
// 2) needs both columns, so it always drops to a fresh row; a large widget
// (rowSpan 2) also reserves the next row beneath it.

import type { WidgetType } from '../components/TodayWidgets';

export const GRID_COLUMNS = 2;

export type WidgetSize = 'small' | 'medium' | 'large';

// Horizontal span (in columns) per size.
export const SIZE_SPAN: Record<WidgetSize, number> = {
  small: 1,
  medium: 2,
  large: 2,
};

// Vertical span (in grid rows) per size.
export const SIZE_ROW_SPAN: Record<WidgetSize, number> = {
  small: 1,
  medium: 1,
  large: 2,
};

// Default size per widget type. Mirrors the wiring in TodayViewScreen:
// weather/medium, upNext/large, everything else/small. This is the single
// source of truth consumed by both the grid layout and any caller needing
// DEFAULT_SIZES.
export const DEFAULT_SIZES: Record<WidgetType, WidgetSize> = {
  battery: 'small',
  storage: 'small',
  weather: 'medium',
  upNext: 'large',
  messages: 'small',
  screenTime: 'small',
};

export interface WidgetGridCell {
  type: WidgetType;
  size: WidgetSize;
  /** Column index of the cell's top-left corner (0-based). */
  col: number;
  /** Row index of the cell's top-left corner (0-based). */
  row: number;
  /** Number of columns the cell occupies. */
  colSpan: number;
  /** Number of rows the cell occupies. */
  rowSpan: number;
}

/**
 * Pack a list of widget types into a 2-column grid.
 *
 * @param types   Ordered list of enabled widget types (order is preserved).
 * @param sizes   Optional per-type size override. Defaults to DEFAULT_SIZES;
 *                an unknown/absent type falls back to 'small' rather than
 *                throwing, so a partial map from storage never crashes layout.
 */
export function computeWidgetGrid(
  types: WidgetType[],
  sizes: Record<WidgetType, WidgetSize> = DEFAULT_SIZES,
): WidgetGridCell[] {
  const cells: WidgetGridCell[] = [];
  // `rowCursor[col]` = next free row in that column. A wide (colSpan 2) widget
  // must start where BOTH columns are free, so we track per-column free rows
  // and advance each column it occupies by its rowSpan.
  const colFreeAt: number[] = new Array(GRID_COLUMNS).fill(0);

  const sizeFor = (t: WidgetType): WidgetSize =>
    sizes[t] ?? 'small';

  for (const type of types) {
    const size = sizeFor(type);
    const colSpan = SIZE_SPAN[size];
    const rowSpan = SIZE_ROW_SPAN[size];

    // Find the earliest placement: for every valid starting column c whose
    // run [c, c+colSpan-1] fits inside GRID_COLUMNS, the earliest row is the
    // max of the free rows of those columns. Pick the placement with the
    // smallest row, tie-broken to the smallest column, so small widgets fill
    // a row left-to-right (side by side) before wrapping.
    let startCol = 0;
    let startRow = Infinity;
    for (let c = 0; c <= GRID_COLUMNS - colSpan; c++) {
      const row = Math.max(...colFreeAt.slice(c, c + colSpan));
      if (row < startRow || (row === startRow && c < startCol)) {
        startRow = row;
        startCol = c;
      }
    }

    cells.push({
      type,
      size,
      col: startCol,
      row: startRow,
      colSpan,
      rowSpan,
    });

    // Reserve the occupied rows in every column this widget spans.
    for (let c = startCol; c < startCol + colSpan; c++) {
      colFreeAt[c] = startRow + rowSpan;
    }
  }

  return cells;
}

/** Total number of grid rows occupied by a packed layout (0 for empty). */
export function gridRowCount(cells: WidgetGridCell[]): number {
  if (cells.length === 0) return 0;
  return cells.reduce((max, c) => Math.max(max, c.row + c.rowSpan), 0);
}
