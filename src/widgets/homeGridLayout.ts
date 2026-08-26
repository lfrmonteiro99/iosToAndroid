/**
 * Packing widgets and icons into ONE grid on the home screen (#935).
 *
 * What this replaces: there were two grids that did not know about each other.
 * `widgetGrid.ts` packs a 2-column Today View grid, and the home screen did not
 * even use it — it drew widgets in a separate `View` ABOVE the icons, each one
 * `HOME_WIDGET_ITEM_WIDTH` wide (half the screen, always, for every widget and
 * every size), with the icon grid starting underneath.
 *
 * So there was nothing "around" a widget that could adapt. Icons were never
 * displaced by one; there was a block on top and icons began below it. That is
 * why "draggable, and the things around it have to adapt" was not a tuning
 * problem — there was no model in which it could happen.
 *
 * On the reference, two square widgets each occupy 2x2 ICON cells, together
 * filling the four columns, and the icons carry on in the same grid right
 * underneath. That is what this module computes.
 *
 * Pure and framework-free: no React, no Dimensions. The screen turns the
 * returned cells into positioned views. That keeps every rule below — spans,
 * clamping, overflow — testable without mounting a pager.
 */
import type { WidgetInstance, WidgetSize } from './widgetInstances';

/** Footprint in ICON cells. The correspondence iOS uses, and what the reference shows. */
export const WIDGET_CELL_SPAN: Record<WidgetSize, { cols: number; rows: number }> = {
  small: { cols: 2, rows: 2 },
  medium: { cols: 4, rows: 2 },
  large: { cols: 4, rows: 4 },
};

/** A widget placed on a page, in cell coordinates. */
export interface PlacedWidget {
  id: string;
  instance: WidgetInstance;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

/** An icon (or folder) placed in a single cell. */
export interface PlacedItem<T> {
  item: T;
  col: number;
  row: number;
}

export interface PageLayout<T> {
  widgets: PlacedWidget[];
  items: PlacedItem<T>[];
  /** Rows actually occupied — the screen sizes the page body from this. */
  rowsUsed: number;
}

/**
 * The span a size gets on a grid this wide.
 *
 * Clamped, because the column count is a user setting (#503): a `medium` wants
 * 4 columns and the user may be running 3. A widget wider than the grid would
 * otherwise be unplaceable and vanish silently, which is the worst of the
 * available outcomes.
 */
export function spanFor(size: WidgetSize, cols: number): { cols: number; rows: number } {
  const span = WIDGET_CELL_SPAN[size] ?? WIDGET_CELL_SPAN.small;
  return { cols: Math.max(1, Math.min(span.cols, cols)), rows: Math.max(1, span.rows) };
}

/** Occupancy bitmap for one page. */
function makeGrid(cols: number, rows: number): boolean[][] {
  return Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
}

function fits(grid: boolean[][], col: number, row: number, colSpan: number, rowSpan: number): boolean {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (col < 0 || row < 0 || col + colSpan > cols || row + rowSpan > rows) return false;
  for (let r = row; r < row + rowSpan; r++) {
    for (let c = col; c < col + colSpan; c++) {
      if (grid[r][c]) return false;
    }
  }
  return true;
}

function occupy(grid: boolean[][], col: number, row: number, colSpan: number, rowSpan: number): void {
  for (let r = row; r < row + rowSpan; r++) {
    for (let c = col; c < col + colSpan; c++) grid[r][c] = true;
  }
}

/** First row-major position where the footprint fits, or null. */
function firstFit(
  grid: boolean[][],
  colSpan: number,
  rowSpan: number,
): { col: number; row: number } | null {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  for (let row = 0; row + rowSpan <= rows; row++) {
    for (let col = 0; col + colSpan <= cols; col++) {
      if (fits(grid, col, row, colSpan, rowSpan)) return { col, row };
    }
  }
  return null;
}

export interface HomeGridInput<T> {
  cols: number;
  rows: number;
  /** Every widget, on every page. `page` decides which page it lands on. */
  widgets: readonly WidgetInstance[];
  /** Icons and folders, in the order they must keep. */
  items: readonly T[];
}

/**
 * Lay out every page.
 *
 * Rules, in order:
 *
 *  1. Widgets are placed first, page by page, at the position they carry. A
 *     widget whose stored position no longer fits — the grid got narrower, or
 *     another widget already covers it — is moved to the first free spot on its
 *     page rather than dropped: losing a widget silently is worse than moving it.
 *     If its page has no room at all it spills to the next page, for the same
 *     reason.
 *  2. Icons then fill the free cells in row-major order, KEEPING their order.
 *  3. When a page runs out of free cells the remaining icons continue on the
 *     next page. This is the part that breaks everything quietly if it is got
 *     wrong: paging on a fixed `cols * rows` stops being true the moment a
 *     widget exists, so the count per page has to come from the page.
 *
 * Always returns at least one page, so the pager never has zero children.
 */
export function computeHomeGridLayout<T>({ cols, rows, widgets, items }: HomeGridInput<T>): PageLayout<T>[] {
  const safeCols = Math.max(1, Math.floor(cols));
  const safeRows = Math.max(1, Math.floor(rows));

  // Widgets grouped by the page they claim, in a stable order so the layout is
  // deterministic for a given list.
  const byPage = new Map<number, WidgetInstance[]>();
  let maxWidgetPage = 0;
  for (const w of widgets) {
    const page = Math.max(0, Math.floor(w.page));
    maxWidgetPage = Math.max(maxWidgetPage, page);
    const list = byPage.get(page);
    if (list) list.push(w);
    else byPage.set(page, [w]);
  }

  const grids: boolean[][][] = [];
  const pages: PageLayout<T>[] = [];

  const ensurePage = (index: number): void => {
    while (grids.length <= index) {
      grids.push(makeGrid(safeCols, safeRows));
      pages.push({ widgets: [], items: [], rowsUsed: 0 });
    }
  };

  ensurePage(maxWidgetPage);

  // ── 1. Widgets ──────────────────────────────────────────────────────────
  for (let page = 0; page <= maxWidgetPage; page++) {
    for (const instance of byPage.get(page) ?? []) {
      const span = spanFor(instance.size, safeCols);
      let target = page;
      let at: { col: number; row: number } | null = null;

      const col = Math.max(0, Math.floor(instance.col));
      const row = Math.max(0, Math.floor(instance.row));
      if (fits(grids[page], col, row, span.cols, span.rows)) {
        at = { col, row };
      } else {
        at = firstFit(grids[page], span.cols, span.rows);
        // Still nowhere: walk forward. Bounded by construction — a fresh page
        // always fits a footprint that has been clamped to the grid.
        while (at == null) {
          target += 1;
          ensurePage(target);
          at = firstFit(grids[target], span.cols, span.rows);
        }
      }

      occupy(grids[target], at.col, at.row, span.cols, span.rows);
      pages[target].widgets.push({
        id: instance.id,
        instance,
        col: at.col,
        row: at.row,
        colSpan: span.cols,
        rowSpan: span.rows,
      });
    }
  }

  // ── 2 & 3. Icons into the free cells, overflowing forward ────────────────
  let page = 0;
  for (const item of items) {
    for (;;) {
      ensurePage(page);
      const at = firstFit(grids[page], 1, 1);
      if (at) {
        occupy(grids[page], at.col, at.row, 1, 1);
        pages[page].items.push({ item, col: at.col, row: at.row });
        break;
      }
      page += 1;
    }
  }

  for (const p of pages) {
    p.rowsUsed = [...p.widgets, ...p.items].reduce(
      (max, e) => Math.max(max, e.row + ('rowSpan' in e ? e.rowSpan : 1)),
      0,
    );
  }

  return pages.length > 0 ? pages : [{ widgets: [], items: [], rowsUsed: 0 }];
}

/** Free single cells on a page — what "how many icons fit here" now means. */
export function freeCellCount<T>(page: PageLayout<T>, cols: number, rows: number): number {
  const used = page.widgets.reduce((n, w) => n + w.colSpan * w.rowSpan, 0) + page.items.length;
  return Math.max(0, Math.max(1, cols) * Math.max(1, rows) - used);
}

/**
 * Decide which home page a NEW widget should land on (#936).
 *
 * It goes where the user is looking — the page the gallery was opened from.
 * If that page has no free footprint for the widget's span, the next page with
 * room takes it and `overflowed` is set so the caller can tell the user;
 * silently dropping the widget, or placing it on a page the user is not looking
 * at, is worse than refusing.
 *
 * Pure and framework-free, so the rule is testable without mounting a pager.
 */
export function resolveWidgetPlacement({
  cols,
  rows,
  placed,
  focusPage,
  size,
}: {
  cols: number;
  rows: number;
  /** Instances already on home pages (the ones `isOnHomePage` accepts). */
  placed: readonly WidgetInstance[];
  /** The page being viewed when the gallery opened. */
  focusPage: number;
  size: WidgetSize;
}): { page: number; overflowed: boolean } {
  const safeCols = Math.max(1, Math.floor(cols));
  const safeRows = Math.max(1, Math.floor(rows));
  const span = spanFor(size, safeCols);

  // Rebuild occupancy per page exactly as the packer would, so the free-space
  // check matches what `computeHomeGridLayout` will actually produce.
  const grids = new Map<number, boolean[][]>();
  const gridFor = (page: number): boolean[][] => {
    const p = Math.max(0, Math.floor(page));
    let g = grids.get(p);
    if (!g) {
      g = makeGrid(safeCols, safeRows);
      grids.set(p, g);
    }
    return g;
  };
  for (const w of placed) {
    const ws = spanFor(w.size, safeCols);
    const col = Math.max(0, Math.floor(w.col));
    const row = Math.max(0, Math.floor(w.row));
    if (fits(gridFor(w.page), col, row, ws.cols, ws.rows)) {
      occupy(gridFor(w.page), col, row, ws.cols, ws.rows);
    } else {
      const moved = firstFit(gridFor(w.page), ws.cols, ws.rows);
      if (moved) occupy(gridFor(w.page), moved.col, moved.row, ws.cols, ws.rows);
    }
  }

  const start = Math.max(0, Math.floor(focusPage));
  if (firstFit(gridFor(start), span.cols, span.rows)) {
    return { page: start, overflowed: false };
  }

  // Walk forward. A page never seen before is empty, so this terminates at
  // start + 1 at the latest — there is always a fresh page with room.
  for (let page = start + 1; ; page++) {
    if (firstFit(gridFor(page), span.cols, span.rows)) {
      return { page, overflowed: true };
    }
  }
}
