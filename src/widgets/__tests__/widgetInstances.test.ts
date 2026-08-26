import {
  ALLOWED_WIDGET_SIZES,
  DEFAULT_WIDGET_SIZES,
  addWidget,
  instanceTypes,
  makeWidgetId,
  migrateTypesToInstances,
  moveWidget,
  normalizeInstances,
  reconcileWithTypes,
  removeWidget,
  resizeWidget,
  type WidgetInstance,
  PAGE_UNPLACED,
  isOnHomePage,
} from '../widgetInstances';
import { ALL_WIDGET_TYPES, type WidgetType } from '../TodayWidgets';

// #933 — the widget instance model. Configuration used to be a set of
// switched-on TYPES, which ruled out two Weather widgets, a page, a position
// and a per-widget size in one stroke. Everything here is the pure half: the
// migration off the old key, the tolerant parse, and the CRUD. The hook that
// persists it lives in TodayWidgets.tsx.

const KNOWN = ALL_WIDGET_TYPES;

function inst(over: Partial<WidgetInstance> = {}): WidgetInstance {
  return { id: 'battery-0', type: 'battery', size: 'small', page: 0, col: 0, row: 0, ...over };
}

describe('migrateTypesToInstances', () => {
  it('turns the old type list into instances, in order', () => {
    const migrated = migrateTypesToInstances(['battery', 'weather']);
    expect(migrated.map((i) => i.type)).toEqual(['battery', 'weather']);
  });

  it('gives each one the size that type rendered at before', () => {
    // Non-regression: the point of the migration is that nothing looks
    // different the first time the new version runs.
    const migrated = migrateTypesToInstances(['battery', 'weather', 'upNext']);
    expect(migrated.map((i) => i.size)).toEqual(['small', 'medium', 'large']);
  });

  it('leaves everything UNPLACED rather than putting it on page 0', () => {
    // Changed deliberately while implementing #935, and this is the reason: with
    // real cell footprints the five widgets in DEFAULT_ENABLED take 20 of a 4x6
    // page's 24 cells, and upNext (4x4) does not fit at all. Migrating them onto
    // page 0 flooded the home screen and pushed every icon to page 2. The Today
    // View shows every instance either way; the home grid shows what was placed
    // on it.
    const migrated = migrateTypesToInstances(['battery', 'weather', 'storage']);
    expect(migrated.every((i) => i.page === PAGE_UNPLACED)).toBe(true);
    expect(migrated.every((i) => isOnHomePage(i))).toBe(false);
  });

  it('gives each one a distinct id', () => {
    const migrated = migrateTypesToInstances(['battery', 'weather', 'battery']);
    expect(new Set(migrated.map((i) => i.id)).size).toBe(3);
  });

  it('preserves the order, which is the only arrangement the user ever stated', () => {
    // The Today View grid reads this order. Positions are not invented: an
    // unplaced widget has no cell, and #935's packer assigns one when it is
    // placed on a page.
    const migrated = migrateTypesToInstances(['battery', 'storage', 'messages']);
    expect(migrated.map((i) => i.type)).toEqual(['battery', 'storage', 'messages']);
  });

  it('handles an empty list', () => {
    expect(migrateTypesToInstances([])).toEqual([]);
  });
});

describe('normalizeInstances', () => {
  it('reads back what was written', () => {
    const written = [inst(), inst({ id: 'weather-0', type: 'weather', size: 'medium', page: 1, col: 2, row: 4 })];
    expect(normalizeInstances(written, KNOWN)).toEqual(written);
  });

  it('returns empty for a blob that is not an array', () => {
    // A corrupt config must never take the home screen down — the shape
    // normalizeCategoryOverrides established.
    expect(normalizeInstances({ nope: true }, KNOWN)).toEqual([]);
    expect(normalizeInstances(null, KNOWN)).toEqual([]);
    expect(normalizeInstances('battery', KNOWN)).toEqual([]);
  });

  it('drops an entry that is not an object', () => {
    expect(normalizeInstances(['battery', 42, null, inst()], KNOWN)).toHaveLength(1);
  });

  it('drops an unknown widget type rather than rendering nothing for it', () => {
    // A type removed in a later version, or a typo, must not survive into the
    // list where every consumer would have to guard against it.
    const parsed = normalizeInstances([inst(), inst({ id: 'x', type: 'nope' as WidgetType })], KNOWN);
    expect(parsed.map((i) => i.type)).toEqual(['battery']);
  });

  it('fills a missing size from the type default', () => {
    const parsed = normalizeInstances([{ id: 'w', type: 'weather', page: 0, col: 0, row: 0 }], KNOWN);
    expect(parsed[0].size).toBe('medium');
  });

  it('rejects a size that is not one of the three', () => {
    const parsed = normalizeInstances([{ id: 'w', type: 'weather', size: 'enormous' }], KNOWN);
    expect(parsed[0].size).toBe('medium');
  });

  // #937 AC 7 has TWO doors into `size`, not one. `resizeWidget` refuses a size
  // the type does not declare, but the stored blob is the other way in — a
  // build from before ALLOWED_WIDGET_SIZES existed, a hand-edited value, or a
  // future build that narrows a type's list. Left unchecked, a persisted
  // `{type:'battery', size:'large'}` renders Battery at 4x4 and eats 16 cells:
  // exactly the empty oversized card point 5 of the issue forbids, reached
  // without the UI ever offering it.
  it('clamps a persisted size the type does not declare back to that type\'s default', () => {
    const parsed = normalizeInstances([{ id: 'b', type: 'battery', size: 'large', page: 0 }], KNOWN);
    expect(parsed[0].size).toBe('small');
    expect(ALLOWED_WIDGET_SIZES.battery).not.toContain('large');
  });

  it('clamps upNext\'s disallowed \'small\' too — the default is not always the smallest size', () => {
    // upNext allows medium|large and defaults to large: a clamp that reached
    // for "the smallest allowed" instead of the type default would land on
    // medium here and silently shrink every migrated Up Next widget.
    const parsed = normalizeInstances([{ id: 'u', type: 'upNext', size: 'small', page: 0 }], KNOWN);
    expect(parsed[0].size).toBe('large');
  });

  it('leaves a persisted size the type DOES declare untouched', () => {
    // The inverse of the clamp: it must not flatten every widget to its
    // default. Weather declares all three, so a stored 'large' survives.
    const parsed = normalizeInstances([{ id: 'w', type: 'weather', size: 'large', page: 0 }], KNOWN);
    expect(parsed[0].size).toBe('large');
  });

  it('clamps on the read path for every type, for its own disallowed sizes', () => {
    // Table-driven so a type added later without an ALLOWED entry, or with a
    // narrowed one, cannot slip through with only battery/upNext covered.
    const ALL_SIZES = ['small', 'medium', 'large'] as const;
    for (const type of KNOWN) {
      for (const size of ALL_SIZES) {
        const parsed = normalizeInstances([{ id: `${type}-x`, type, size, page: 0 }], KNOWN);
        const expected = ALLOWED_WIDGET_SIZES[type].includes(size) ? size : DEFAULT_WIDGET_SIZES[type];
        expect({ type, size, got: parsed[0].size }).toEqual({ type, size, got: expected });
      }
    }
  });

  it('replaces a duplicate id instead of keeping two widgets that address the same thing', () => {
    // Two instances sharing an id make every move and resize ambiguous, which
    // is worse than losing the id.
    const parsed = normalizeInstances([inst(), inst()], KNOWN);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].id).not.toBe(parsed[1].id);
  });

  it('replaces a missing or empty id', () => {
    const parsed = normalizeInstances([{ type: 'battery' }, { type: 'battery', id: '' }], KNOWN);
    expect(parsed.every((i) => i.id.length > 0)).toBe(true);
    expect(parsed[0].id).not.toBe(parsed[1].id);
  });

  it('clamps a nonsensical position to 0 rather than propagating NaN into layout', () => {
    const parsed = normalizeInstances(
      [{ id: 'a', type: 'battery', col: -3, row: Number.NaN, page: 'first' }],
      KNOWN,
    );
    expect(parsed[0]).toMatchObject({ col: 0, row: 0, page: PAGE_UNPLACED });
  });

  it('keeps a negative page as UNPLACED instead of clamping it to page 0', () => {
    // The one coordinate where a negative value is meaningful: clamping it to 0
    // would silently move every unplaced widget onto the first home page.
    const parsed = normalizeInstances([{ id: 'a', type: 'battery', page: -1 }], KNOWN);
    expect(parsed[0].page).toBe(PAGE_UNPLACED);
  });

  it('floors a fractional cell coordinate', () => {
    const parsed = normalizeInstances([{ id: 'a', type: 'battery', col: 2.7, row: 1.2 }], KNOWN);
    expect(parsed[0]).toMatchObject({ col: 2, row: 1 });
  });
});

describe('CRUD', () => {
  it('addWidget appends rather than inserting', () => {
    // Both surfaces read this order; a widget arriving in the middle would
    // silently reshuffle an arrangement the user made.
    const list = addWidget(migrateTypesToInstances(['battery', 'weather']), 'storage');
    expect(instanceTypes(list)).toEqual(['battery', 'weather', 'storage']);
  });

  it('addWidget seeds the size from the type default', () => {
    const [added] = addWidget([], 'upNext');
    expect(added.size).toBe(DEFAULT_WIDGET_SIZES.upNext);
  });

  it('addWidget takes an explicit size, page and position when given one', () => {
    const [added] = addWidget([], 'weather', { size: 'small', page: 2, col: 2, row: 4 });
    expect(added).toMatchObject({ size: 'small', page: 2, col: 2, row: 4 });
  });

  it('addWidget never reuses an id, even after a removal', () => {
    // The failure this prevents: ids derived from length collide as soon as
    // anything is removed, and a later widget inherits an earlier one's identity.
    let list = addWidget([], 'battery');
    list = addWidget(list, 'battery');
    const firstId = list[0].id;
    list = removeWidget(list, firstId);
    list = addWidget(list, 'battery');
    expect(new Set(list.map((i) => i.id)).size).toBe(list.length);
    expect(list.map((i) => i.id)).not.toContain(firstId);
  });

  it('two instances of the same type coexist with different ids', () => {
    const list = addWidget(addWidget([], 'weather'), 'weather');
    expect(list).toHaveLength(2);
    expect(list[0].id).not.toBe(list[1].id);
  });

  it('removeWidget removes exactly one, by id', () => {
    const list = addWidget(addWidget([], 'weather'), 'weather');
    const left = removeWidget(list, list[0].id);
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe(list[1].id);
  });

  it('removeWidget is a no-op for an id that is not there', () => {
    const list = addWidget([], 'weather');
    expect(removeWidget(list, 'nope-9')).toEqual(list);
  });

  it('moveWidget changes page and position, and nothing else', () => {
    const list = addWidget([], 'weather');
    const [moved] = moveWidget(list, list[0].id, 2, 2, 4);
    expect(moved).toMatchObject({ page: 2, col: 2, row: 4, type: 'weather', size: 'medium' });
    expect(moved.id).toBe(list[0].id);
  });

  it('moveWidget leaves the other instances alone', () => {
    const list = addWidget(addWidget([], 'weather'), 'battery');
    const moved = moveWidget(list, list[0].id, 1, 0, 0);
    expect(moved[1]).toEqual(list[1]);
  });

  it('resizeWidget changes size, and nothing else', () => {
    const list = addWidget([], 'weather', { page: 0 });
    const [resized] = resizeWidget(list, list[0].id, 'large');
    expect(resized.size).toBe('large');
    expect(resized).toMatchObject({ id: list[0].id, page: 0, col: 0, row: 0 });
  });

  it('addWidget leaves a widget unplaced unless a page is given', () => {
    // So the gallery has to say where. Defaulting to page 0 is what flooded the
    // home screen during #935.
    expect(addWidget([], 'weather')[0].page).toBe(PAGE_UNPLACED);
    expect(addWidget([], 'weather', { page: 2 })[0].page).toBe(2);
  });

  it('two instances of one type can have different sizes', () => {
    // The thing a per-type size table could never express.
    let list = addWidget(addWidget([], 'weather'), 'weather');
    list = resizeWidget(list, list[0].id, 'large');
    expect(list.map((i) => i.size)).toEqual(['large', 'medium']);
  });

  // #937 AC 7: a size not declared for the type is refused, not silently
  // accepted. Battery only declares 'small' — nothing else has content to
  // show at a bigger footprint (see ALLOWED_WIDGET_SIZES's own comment).
  it('resizeWidget refuses a size the type does not declare, leaving the instance untouched', () => {
    const list = addWidget([], 'battery');
    const [resized] = resizeWidget(list, list[0].id, 'large');
    expect(resized.size).toBe('small');
    expect(resized).toEqual(list[0]);
  });

  it('resizeWidget still applies a size the type DOES declare', () => {
    const list = addWidget([], 'weather');
    const [resized] = resizeWidget(list, list[0].id, 'small');
    expect(resized.size).toBe('small');
  });

  it("every type's own DEFAULT_WIDGET_SIZES entry is one of its ALLOWED_WIDGET_SIZES", () => {
    // A freshly-placed widget must always be resizable back to the size it
    // started at — otherwise its own default would be an invalid state.
    for (const type of ALL_WIDGET_TYPES) {
      expect(ALLOWED_WIDGET_SIZES[type]).toContain(DEFAULT_WIDGET_SIZES[type]);
    }
  });
});

describe('reconcileWithTypes', () => {
  // The Today View's Edit Widgets panel still speaks in types. This is what
  // keeps it working against the instance model without rewriting it (#933 is
  // the model; the surfaces are #935-#938).
  it('adds an instance for a type that appeared', () => {
    const list = reconcileWithTypes(migrateTypesToInstances(['battery']), ['battery', 'weather']);
    expect(instanceTypes(list)).toEqual(['battery', 'weather']);
  });

  it('drops every instance of a type that disappeared', () => {
    const list = reconcileWithTypes(addWidget(addWidget([], 'weather'), 'weather'), []);
    expect(list).toEqual([]);
  });

  it('keeps id, size and position for a type that survived', () => {
    // The reason this is a reconcile and not a rebuild: rewriting the list from
    // types would silently reset every position and size the user chose.
    let list = addWidget([], 'weather', { size: 'large', page: 3, col: 2, row: 6 });
    list = reconcileWithTypes(list, ['weather', 'battery']);
    expect(list[0]).toMatchObject({ size: 'large', page: 3, col: 2, row: 6 });
  });

  it('does not multiply instances of a type that is already placed twice', () => {
    const twoWeathers = addWidget(addWidget([], 'weather'), 'weather');
    const list = reconcileWithTypes(twoWeathers, ['weather']);
    expect(list).toHaveLength(2);
  });
});

describe('makeWidgetId', () => {
  it('is stable for the same type and sequence', () => {
    // The id has to survive a restart: it is the key a move, a resize and a
    // remove all address.
    expect(makeWidgetId('weather', 2)).toBe(makeWidgetId('weather', 2));
  });

  it('differs by type and by sequence', () => {
    expect(makeWidgetId('weather', 0)).not.toBe(makeWidgetId('battery', 0));
    expect(makeWidgetId('weather', 0)).not.toBe(makeWidgetId('weather', 1));
  });
});
