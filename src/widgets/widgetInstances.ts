/**
 * The widget INSTANCE model (#933) — the data foundation the rest of the widget
 * epic (#932) stands on.
 *
 * What it replaces: widget configuration was a set of switched-on TYPES, an
 * array of strings under `@iostoandroid/widget_config`. A widget was "on" or
 * "off", and that one shape ruled out everything the epic asks for:
 *
 *  - No two Weather widgets (two cities) — the type is already on.
 *  - Nowhere to record which PAGE a widget is on, hence the hard
 *    `pageIndex === 0` on the home screen.
 *  - Nowhere to record WHERE on the page, so there is nothing for a drag to
 *    move (#938).
 *  - Size was a constant per type, not a property of the placed widget, so
 *    resizing (#937) had no field to write to.
 *
 * Everything here is pure and framework-free — no React, no AsyncStorage — so
 * the migration and the CRUD are unit-testable without mounting anything. The
 * hook and the persistence live in TodayWidgets.tsx, which owns the key.
 *
 * DELIBERATELY NOT IN SCOPE: layout and rendering. The home screen goes on
 * drawing the half-width row it draws today, fed from this list. Turning
 * instances into grid cells is #935.
 */
import type { WidgetType } from './TodayWidgets';

/** Widget footprint. One definition, shared by the Today View grid and the home grid. */
export type WidgetSize = 'small' | 'medium' | 'large';

/**
 * Default size AT PLACEMENT — no longer "the size of this type".
 *
 * This collapses the two tables that used to compete: `WIDGET_SIZES`
 * (TodayWidgets.tsx) and `DEFAULT_SIZES` (widgetGrid.ts) held the same six
 * entries in two files, free to drift. Once size lives on the instance, the
 * only thing a per-type table can honestly mean is the size a NEW widget of
 * that type starts at.
 */
export const DEFAULT_WIDGET_SIZES: Record<WidgetType, WidgetSize> = {
  battery: 'small',
  storage: 'small',
  weather: 'medium',
  upNext: 'large',
  messages: 'small',
  screenTime: 'small',
};

/** A widget the user has placed, as opposed to a type that is switched on. */
export interface WidgetInstance {
  /** Stable across restarts — it is the key everything else refers to. */
  id: string;
  type: WidgetType;
  /** Per instance, not per type: two Weather widgets may differ in size. */
  size: WidgetSize;
  /** Home page index. The Today View has its own list and ignores this. */
  page: number;
  /** Top-left corner, in icon-grid cells. Consumed by #935; stored from now. */
  col: number;
  row: number;
}

export const WIDGET_INSTANCES_KEY = '@iostoandroid/widget_instances';

/**
 * A stable id.
 *
 * Never an array index: the id is what a move, a resize and a remove all
 * address, and an index changes when anything before it is removed — every
 * later widget would silently take on its neighbour's identity.
 *
 * `seq` is threaded by the caller rather than read from a module-level counter
 * so that generating ids is deterministic under test and cannot depend on how
 * many instances an earlier test happened to create.
 */
export function makeWidgetId(type: WidgetType, seq: number): string {
  return `${type}-${seq}`;
}

/** The smallest unused sequence number for a type, so ids never collide. */
function nextSeq(instances: WidgetInstance[], type: WidgetType): number {
  const prefix = `${type}-`;
  let max = -1;
  for (const i of instances) {
    if (!i.id.startsWith(prefix)) continue;
    const n = Number.parseInt(i.id.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

function isWidgetSize(v: unknown): v is WidgetSize {
  return v === 'small' || v === 'medium' || v === 'large';
}

/** A finite, non-negative integer, or the given fallback. */
function coord(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

/**
 * Parse whatever is in storage into instances, dropping only what cannot be
 * understood.
 *
 * Tolerant on purpose, in the shape of `normalizeCategoryOverrides`: a blob
 * that is not an array, an entry that is not an object, an unknown widget type
 * (one removed in a later version, or a typo), a missing size — none of those
 * may take the home screen down. `knownTypes` is injected rather than imported
 * so this file stays free of the type table and the test can narrow it.
 */
export function normalizeInstances(raw: unknown, knownTypes: readonly WidgetType[]): WidgetInstance[] {
  if (!Array.isArray(raw)) return [];

  const out: WidgetInstance[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;

    const type = e.type as WidgetType;
    if (!knownTypes.includes(type)) continue;

    // A duplicate id is worse than a missing one: two instances that address
    // the same widget make every move and resize ambiguous. Re-key instead.
    let id = typeof e.id === 'string' && e.id.length > 0 ? e.id : makeWidgetId(type, out.length);
    if (seen.has(id)) id = makeWidgetId(type, nextSeq(out, type));
    seen.add(id);

    out.push({
      id,
      type,
      size: isWidgetSize(e.size) ? e.size : DEFAULT_WIDGET_SIZES[type],
      page: coord(e.page, 0),
      col: coord(e.col, 0),
      row: coord(e.row, 0),
    });
  }

  return out;
}

/**
 * Convert the old type list into instances.
 *
 * Order is preserved and positions are packed in that order, because the old
 * list order is the only statement of arrangement the user ever made — the
 * home row and the Today View grid both read it. Sizes come from the per-type
 * defaults, which is exactly what those widgets rendered at before.
 *
 * Positions are laid out as pairs across a 4-column icon grid (a `small` is
 * 2x2 there), which is what #935 will place them into. Until then nothing
 * reads col/row, so the arrangement only has to be stable and sensible.
 */
export function migrateTypesToInstances(types: readonly WidgetType[]): WidgetInstance[] {
  const instances: WidgetInstance[] = [];
  let col = 0;
  let row = 0;

  types.forEach((type, index) => {
    const size = DEFAULT_WIDGET_SIZES[type];
    const span = size === 'small' ? 2 : 4;
    if (col + span > 4) {
      col = 0;
      row += 2;
    }
    instances.push({ id: makeWidgetId(type, index), type, size, page: 0, col, row });
    col += span;
    if (col >= 4) {
      col = 0;
      row += 2;
    }
  });

  return instances;
}

// ── CRUD, as pure reducers ────────────────────────────────────────────────
// Reducers rather than methods so the hook stays a thin persistence wrapper and
// every rule below is testable without React.

/**
 * Append a widget. Appended, never inserted: both surfaces read this order, and
 * a new widget arriving in the middle would silently reshuffle an arrangement
 * the user made.
 */
export function addWidget(
  instances: WidgetInstance[],
  type: WidgetType,
  opts: { size?: WidgetSize; page?: number; col?: number; row?: number } = {},
): WidgetInstance[] {
  return [
    ...instances,
    {
      id: makeWidgetId(type, nextSeq(instances, type)),
      type,
      size: opts.size ?? DEFAULT_WIDGET_SIZES[type],
      page: coord(opts.page, 0),
      col: coord(opts.col, 0),
      row: coord(opts.row, 0),
    },
  ];
}

export function removeWidget(instances: WidgetInstance[], id: string): WidgetInstance[] {
  return instances.filter((i) => i.id !== id);
}

export function moveWidget(
  instances: WidgetInstance[],
  id: string,
  page: number,
  col: number,
  row: number,
): WidgetInstance[] {
  return instances.map((i) =>
    i.id === id ? { ...i, page: coord(page, i.page), col: coord(col, i.col), row: coord(row, i.row) } : i,
  );
}

export function resizeWidget(instances: WidgetInstance[], id: string, size: WidgetSize): WidgetInstance[] {
  return instances.map((i) => (i.id === id ? { ...i, size } : i));
}

/**
 * Reconcile an instance list against a list of switched-on TYPES.
 *
 * The Today View's Edit Widgets panel still speaks in types — it has no notion
 * of a placed instance, and rewriting it is not this issue. This keeps that
 * panel working against the new model: a type that appears gains one instance,
 * a type that disappears loses all of its, and everything else keeps its id,
 * size and position untouched.
 */
export function reconcileWithTypes(
  instances: WidgetInstance[],
  types: readonly WidgetType[],
): WidgetInstance[] {
  const wanted = new Set(types);
  const kept = instances.filter((i) => wanted.has(i.type));
  const present = new Set(kept.map((i) => i.type));

  let out = kept;
  for (const type of types) {
    if (present.has(type)) continue;
    present.add(type);
    out = addWidget(out, type);
  }
  return out;
}

/** The types currently placed, in order — what callers that still think in types read. */
export function instanceTypes(instances: readonly WidgetInstance[]): WidgetType[] {
  return instances.map((i) => i.type);
}
