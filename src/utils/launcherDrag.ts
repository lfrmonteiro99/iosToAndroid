// Jiggle-mode drag-to-reorder math (#761).
//
// Pure, worklet-free helpers so the swap/edge-scroll decisions can be tested
// without mounting the screen or a real PanGestureHandler. The grid is a
// flexWrap row (LauncherHomeScreen.tsx `pageGrid` style), so a cell's row/col
// is derived from its flat index and `cols` — there is no separate x/y layout
// to measure.

export interface DragTargetParams {
  /** Index (within the current page's item array) the drag started from. */
  startIndex: number;
  /** Gesture translation since the drag began, in dp. */
  translationX: number;
  translationY: number;
  /** Cell width/height for the page being dragged over, in dp. */
  cellWidth: number;
  cellHeight: number;
  /** Columns in the grid. */
  cols: number;
  /** Number of items in the current page (dock/empty slots included). */
  itemCount: number;
}

/**
 * Resolves which flat grid index a drag lands on, from the index it started
 * at plus how many cells over the finger moved. Relative-to-start (not
 * absolute screen coordinates) on purpose: the caller already knows exactly
 * which cell the drag began in, so no on-screen measurement of every other
 * cell is needed.
 *
 * The column is clamped to the grid ([0, cols-1]) — drifting past the left/
 * right edge is the edge-scroll gesture's job (computeEdgeScrollDirection),
 * not a same-page target. The row is clamped to non-negative and the final
 * flat index to the page's actual item count, so a drag that overshoots the
 * last row/short last page lands on the last real cell instead of an index
 * that doesn't exist.
 */
export function computeDragTargetIndex({
  startIndex,
  translationX,
  translationY,
  cellWidth,
  cellHeight,
  cols,
  itemCount,
}: DragTargetParams): number {
  if (itemCount <= 0) return startIndex;
  const safeCols = Math.max(1, cols);
  const startRow = Math.floor(startIndex / safeCols);
  const startCol = startIndex % safeCols;

  const deltaCol = cellWidth > 0 ? Math.round(translationX / cellWidth) : 0;
  const deltaRow = cellHeight > 0 ? Math.round(translationY / cellHeight) : 0;

  const targetCol = Math.max(0, Math.min(safeCols - 1, startCol + deltaCol));
  const targetRow = Math.max(0, startRow + deltaRow);

  const targetIndex = targetRow * safeCols + targetCol;
  return Math.max(0, Math.min(itemCount - 1, targetIndex));
}

export interface WidgetDragTargetParams {
  /** The widget's stored top-left corner before the drag, in grid cells. */
  originCol: number;
  originRow: number;
  /** Gesture translation since the drag began, in dp. */
  translationX: number;
  translationY: number;
  cellWidth: number;
  cellHeight: number;
  /** Grid dimensions, in cells. */
  cols: number;
  rows: number;
  /** The widget's own footprint, in cells (from `spanFor`). */
  colSpan: number;
  rowSpan: number;
}

/**
 * Resolves the grid cell a dragged WIDGET's TOP-LEFT CORNER lands on (#938).
 *
 * Deliberately not the finger's position: a 4x4 widget dropped by its center
 * (or wherever inside it the finger happened to grab) would land somewhere the
 * user never saw outlined. The corner is what moves by exactly the gesture's
 * translation from where it started, so `origin + round(translation / cell)`
 * is the same arithmetic `computeDragTargetIndex` uses for icons, just kept in
 * (col, row) space instead of a flat index — a widget's span means "the next
 * free flat index" doesn't mean anything for it the way it does for a 1x1 icon.
 *
 * Both axes clamp to keep the ENTIRE footprint on the grid (`cols - colSpan`,
 * `rows - rowSpan`), not just the corner — an unclamped corner could park a
 * span partly off-page, which `fits()` would reject as out of bounds and read
 * as "nowhere fits" instead of "the edge".
 */
export function computeWidgetDragTargetCell({
  originCol,
  originRow,
  translationX,
  translationY,
  cellWidth,
  cellHeight,
  cols,
  rows,
  colSpan,
  rowSpan,
}: WidgetDragTargetParams): { col: number; row: number } {
  const deltaCol = cellWidth > 0 ? Math.round(translationX / cellWidth) : 0;
  const deltaRow = cellHeight > 0 ? Math.round(translationY / cellHeight) : 0;

  const maxCol = Math.max(0, cols - colSpan);
  const maxRow = Math.max(0, rows - rowSpan);

  const col = Math.max(0, Math.min(maxCol, originCol + deltaCol));
  const row = Math.max(0, Math.min(maxRow, originRow + deltaRow));

  return { col, row };
}

export type EdgeScrollDirection = 'prev' | 'next' | null;

/**
 * Whether a drag's current on-screen finger position (absoluteX, in the
 * pager's own coordinate space) is close enough to the left/right screen edge
 * to page-scroll to the adjacent page. `edgeThresholdDp` is the width of that
 * hot zone on each side.
 */
export function computeEdgeScrollDirection(
  absoluteX: number,
  screenWidth: number,
  edgeThresholdDp: number,
): EdgeScrollDirection {
  if (screenWidth <= 0) return null;
  if (absoluteX <= edgeThresholdDp) return 'prev';
  if (absoluteX >= screenWidth - edgeThresholdDp) return 'next';
  return null;
}
