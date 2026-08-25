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
