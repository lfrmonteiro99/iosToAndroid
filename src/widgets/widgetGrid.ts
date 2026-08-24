// iOS-style Today View / Home widget grid packing.
//
// iOS lays widgets out on a 2-column grid. Sizes map to cell spans:
//   small  -> 1x1  (a "2x2" icon-sized widget occupies one column, one row)
//   medium -> 2x1  (full width, single row)
//   large  -> 2x2  (full width, two rows)
//
// Packing rule: walk the widgets in order, place each in the left-most column
// whose row range is free (for single-column widgets) or across both columns
// (for full-width widgets), so a full-width widget never lands beside a small
// widget sitting in the other column.

export type WidgetSize = 'small' | 'medium' | 'large';

export const GRID_COLUMNS = 2;

export const SIZE_SPAN: Record<WidgetSize, { w: number; h: number }> = {
  small: { w: 1, h: 1 }, // 2x2 cell
  medium: { w: 2, h: 1 }, // 4x2 cell (full width, one row)
  large: { w: 2, h: 2 }, // full width, two rows
};

export interface WidgetPlacement {
  id: string;
  size: WidgetSize;
  col: number;
  rowStart: number;
  rowSpan: number;
}

export interface WidgetInput {
  id: string;
  size: WidgetSize;
}

const key = (row: number, col: number): number => row * GRID_COLUMNS + col;

/** True when every cell of [rowStart, rowStart+h) × [colStart, colStart+w) is free. */
function regionFree(occupied: Set<number>, colStart: number, w: number, rowStart: number, h: number): boolean {
  for (let r = rowStart; r < rowStart + h; r++) {
    for (let c = colStart; c < colStart + w; c++) {
      if (occupied.has(key(r, c))) return false;
    }
  }
  return true;
}

function occupy(occupied: Set<number>, colStart: number, w: number, rowStart: number, h: number): void {
  for (let r = rowStart; r < rowStart + h; r++) {
    for (let c = colStart; c < colStart + w; c++) {
      occupied.add(key(r, c));
    }
  }
}

/**
 * Pack widgets left-to-right, top-to-bottom onto a 2-column grid.
 * Order is preserved. Returns each widget's { col, rowStart, rowSpan }.
 */
export function computeWidgetGrid(widgets: WidgetInput[]): WidgetPlacement[] {
  const occupied = new Set<number>();
  const placed: WidgetPlacement[] = [];

  for (const w of widgets) {
    const span = SIZE_SPAN[w.size];

    if (span.w >= GRID_COLUMNS) {
      // Full-width: needs both columns free for the whole height.
      let rowStart = 0;
      while (!regionFree(occupied, 0, GRID_COLUMNS, rowStart, span.h)) rowStart++;
      occupy(occupied, 0, GRID_COLUMNS, rowStart, span.h);
      placed.push({ id: w.id, size: w.size, col: 0, rowStart, rowSpan: span.h });
    } else {
      // Single-column: first row where at least one column is free, left first.
      let rowStart = 0;
      let chosenCol = -1;
      for (;;) {
        for (let c = 0; c < GRID_COLUMNS; c++) {
          if (regionFree(occupied, c, span.w, rowStart, span.h)) {
            chosenCol = c;
            break;
          }
        }
        if (chosenCol !== -1) break;
        rowStart++;
      }
      occupy(occupied, chosenCol, span.w, rowStart, span.h);
      placed.push({ id: w.id, size: w.size, col: chosenCol, rowStart, rowSpan: span.h });
    }
  }

  return placed;
}

/** Total number of rows occupied by a placement. */
export function gridRowCount(placed: WidgetPlacement[]): number {
  return placed.reduce((max, p) => Math.max(max, p.rowStart + p.rowSpan), 0);
}
