import { computeDragTargetIndex, computeEdgeScrollDirection, computeWidgetDragTargetCell } from '../launcherDrag';

// #761: jiggle-mode drag-to-reorder. These are the pure functions the pan
// gesture in LauncherHomeScreen/AppIcon delegates to for (a) which grid cell
// a drop lands on and (b) whether the finger is close enough to the pager
// edge to page-scroll. No PanGestureHandler/reanimated involved here on
// purpose — the worklet callbacks just call these with real numbers.

describe('computeDragTargetIndex', () => {
  const base = { cellWidth: 80, cellHeight: 88, cols: 4, itemCount: 8 };

  it('one cell to the right moves the target index by 1', () => {
    expect(computeDragTargetIndex({ ...base, startIndex: 0, translationX: 80, translationY: 0 })).toBe(1);
  });

  it('one row down moves the target index by cols', () => {
    expect(computeDragTargetIndex({ ...base, startIndex: 0, translationX: 0, translationY: 88 })).toBe(4);
  });

  it('a diagonal drag combines row and column deltas', () => {
    // startIndex 1 (row 0, col 1) + one col right + one row down → row1,col2 = index 6
    expect(computeDragTargetIndex({ ...base, startIndex: 1, translationX: 80, translationY: 88 })).toBe(6);
  });

  it('no movement returns the starting index unchanged', () => {
    expect(computeDragTargetIndex({ ...base, startIndex: 3, translationX: 0, translationY: 0 })).toBe(3);
  });

  it('rounds a partial-cell drag to the nearest cell instead of ignoring it', () => {
    // 45/80 rounds to 1 column over, not 0.
    expect(computeDragTargetIndex({ ...base, startIndex: 0, translationX: 45, translationY: 0 })).toBe(1);
  });

  it('clamps the column at the left edge of the grid instead of wrapping to the previous row', () => {
    // startIndex 4 (row1,col0), drag 3 cols further left — must clamp to col 0, not go negative.
    expect(computeDragTargetIndex({ ...base, startIndex: 4, translationX: -300, translationY: 0 })).toBe(4);
  });

  it('clamps the column at the right edge of the grid instead of overflowing into the next row', () => {
    // startIndex 0, drag 10 cols right — clamps to the last column (index cols-1 = 3), not row+1.
    expect(computeDragTargetIndex({ ...base, startIndex: 0, translationX: 800, translationY: 0 })).toBe(3);
  });

  it('clamps to the last real item when the drag overshoots a short last page', () => {
    expect(computeDragTargetIndex({ ...base, itemCount: 3, startIndex: 0, translationX: 0, translationY: 880 })).toBe(2);
  });

  it('an empty page (itemCount 0) returns the starting index (no cell to land on)', () => {
    expect(computeDragTargetIndex({ ...base, itemCount: 0, startIndex: 0, translationX: 80, translationY: 0 })).toBe(0);
  });
});

describe('computeEdgeScrollDirection', () => {
  const SCREEN_WIDTH = 400;
  const THRESHOLD = 40;

  it('returns "prev" when the finger is within the threshold of the left edge', () => {
    expect(computeEdgeScrollDirection(10, SCREEN_WIDTH, THRESHOLD)).toBe('prev');
  });

  it('returns "next" when the finger is within the threshold of the right edge', () => {
    expect(computeEdgeScrollDirection(390, SCREEN_WIDTH, THRESHOLD)).toBe('next');
  });

  it('returns null in the middle of the screen', () => {
    expect(computeEdgeScrollDirection(200, SCREEN_WIDTH, THRESHOLD)).toBeNull();
  });

  it('the boundary itself (exactly at the threshold) counts as the edge', () => {
    expect(computeEdgeScrollDirection(40, SCREEN_WIDTH, THRESHOLD)).toBe('prev');
    expect(computeEdgeScrollDirection(360, SCREEN_WIDTH, THRESHOLD)).toBe('next');
  });

  it('one dp outside the threshold does not trigger', () => {
    expect(computeEdgeScrollDirection(41, SCREEN_WIDTH, THRESHOLD)).toBeNull();
    expect(computeEdgeScrollDirection(359, SCREEN_WIDTH, THRESHOLD)).toBeNull();
  });
});

// #938: widget drag lands by its TOP-LEFT CORNER, not the finger — a 4x4
// widget dropped from wherever inside it the user grabbed must not jump to a
// cell the finger's own position would imply.
describe('computeWidgetDragTargetCell', () => {
  const base = { originCol: 0, originRow: 0, cellWidth: 80, cellHeight: 88, cols: 4, rows: 6, colSpan: 2, rowSpan: 2 };

  it('one cell right moves the corner column by 1', () => {
    expect(computeWidgetDragTargetCell({ ...base, translationX: 80, translationY: 0 })).toEqual({ col: 1, row: 0 });
  });

  it('one cell down moves the corner row by 1', () => {
    expect(computeWidgetDragTargetCell({ ...base, translationX: 0, translationY: 88 })).toEqual({ col: 0, row: 1 });
  });

  it('no movement returns the origin unchanged', () => {
    expect(computeWidgetDragTargetCell({ ...base, translationX: 0, translationY: 0 })).toEqual({ col: 0, row: 0 });
  });

  it('rounds a partial-cell drag to the nearest cell', () => {
    expect(computeWidgetDragTargetCell({ ...base, translationX: 45, translationY: 0 })).toEqual({ col: 1, row: 0 });
  });

  it('clamps the column so the FULL footprint stays on the grid, not just the corner', () => {
    // cols=4, colSpan=2 -> max corner col is 2. A drag past that would let a
    // 2-wide widget hang off the right edge if only the corner were clamped.
    expect(computeWidgetDragTargetCell({ ...base, translationX: 800, translationY: 0 })).toEqual({ col: 2, row: 0 });
  });

  it('clamps the row so the FULL footprint stays on the grid', () => {
    // rows=6, rowSpan=2 -> max corner row is 4.
    expect(computeWidgetDragTargetCell({ ...base, translationX: 0, translationY: 880 })).toEqual({ col: 0, row: 4 });
  });

  it('never drags into negative cells', () => {
    expect(computeWidgetDragTargetCell({ ...base, originCol: 1, originRow: 1, translationX: -300, translationY: -300 })).toEqual({ col: 0, row: 0 });
  });

  it('a widget wider than the grid clamps to column 0 (maxCol floors at 0)', () => {
    expect(computeWidgetDragTargetCell({ ...base, colSpan: 4, cols: 4, translationX: 200, translationY: 0 })).toEqual({ col: 0, row: 0 });
  });
});
