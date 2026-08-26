import {
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

  it('puts everything on page 0, which is where widgets lived', () => {
    const migrated = migrateTypesToInstances(['battery', 'weather', 'storage']);
    expect(migrated.every((i) => i.page === 0)).toBe(true);
  });

  it('gives each one a distinct id', () => {
    const migrated = migrateTypesToInstances(['battery', 'weather', 'battery']);
    expect(new Set(migrated.map((i) => i.id)).size).toBe(3);
  });

  it('packs positions in the order the user had them', () => {
    // The old list order is the only statement of arrangement ever made, so it
    // is what the positions have to preserve.
    const migrated = migrateTypesToInstances(['battery', 'storage']);
    expect(migrated[0].col).toBe(0);
    expect(migrated[1].col).toBe(2); // a small is 2 icon columns wide
    expect(migrated[0].row).toBe(migrated[1].row);
  });

  it('wraps to the next row when the 4 columns are full', () => {
    const migrated = migrateTypesToInstances(['battery', 'storage', 'messages']);
    expect(migrated[2].row).toBeGreaterThan(migrated[0].row);
    expect(migrated[2].col).toBe(0);
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
    expect(parsed[0]).toMatchObject({ col: 0, row: 0, page: 0 });
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
    const list = addWidget([], 'weather');
    const [resized] = resizeWidget(list, list[0].id, 'large');
    expect(resized.size).toBe('large');
    expect(resized).toMatchObject({ id: list[0].id, page: 0, col: 0, row: 0 });
  });

  it('two instances of one type can have different sizes', () => {
    // The thing a per-type size table could never express.
    let list = addWidget(addWidget([], 'weather'), 'weather');
    list = resizeWidget(list, list[0].id, 'large');
    expect(list.map((i) => i.size)).toEqual(['large', 'medium']);
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
