import React from 'react';
import { render, fireEvent, waitFor, within } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WidgetGallery } from '../WidgetGallery';
import {
  WIDGET_CONFIG_KEY,
  WIDGET_INSTANCES_KEY,
  ALL_WIDGET_TYPES,
  WIDGET_LABELS,
} from '../../widgets/TodayWidgets';
import type { WidgetInstance } from '../../widgets/widgetInstances';

// The gallery persists through useWidgetConfig, so the assertions here are
// about what lands in AsyncStorage under the SAME key the Today View panel and
// the home row read. A gallery that changed some other state would look right
// on screen and add nothing to the home screen.
//
// #933 moved that key. Configuration used to be an array of switched-on TYPES
// under WIDGET_CONFIG_KEY, so the gallery toggled: Add swapped itself for
// Remove and a second copy of a type was unreachable by construction. It is now
// a list of placed INSTANCES under WIDGET_INSTANCES_KEY, which is what makes
// two Weather widgets (two cities) expressible — and that is a change of
// contract, so the toggle assertions below became placement assertions.
function seedAsyncStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  (AsyncStorage.getItem as jest.Mock).mockImplementation((k: string) =>
    Promise.resolve(store.get(k) ?? null),
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation((k: string, v: string) => {
    store.set(k, v);
    return Promise.resolve();
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation((k: string) => {
    store.delete(k);
    return Promise.resolve();
  });
  return store;
}

/** The instances the gallery persisted, or null if it never wrote. */
function written(store: Map<string, string>): WidgetInstance[] | null {
  const raw = store.get(WIDGET_INSTANCES_KEY);
  return raw ? (JSON.parse(raw) as WidgetInstance[]) : null;
}

/** Just the types, in order — what the old assertions compared against. */
function writtenTypes(store: Map<string, string>): string[] | null {
  return written(store)?.map((i) => i.type) ?? null;
}

/** Seeds the pre-#933 key, so the migration is what supplies the instances. */
function legacy(types: string[]): Record<string, string> {
  return { [WIDGET_CONFIG_KEY]: JSON.stringify(types) };
}

describe('WidgetGallery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing while hidden', () => {
    seedAsyncStorage();
    const { queryByText } = render(<WidgetGallery visible={false} onClose={jest.fn()} />);
    expect(queryByText('Widgets')).toBeNull();
  });

  it('lists every widget type as its own entry', async () => {
    seedAsyncStorage();
    const { getByTestId } = render(<WidgetGallery visible onClose={jest.fn()} />);
    await waitFor(() => expect(getByTestId('widget-gallery-entry-battery')).toBeTruthy());
    for (const type of ALL_WIDGET_TYPES) {
      expect(getByTestId(`widget-gallery-entry-${type}`)).toBeTruthy();
    }
  });

  it('adds a widget to the persisted config, appending rather than reordering', async () => {
    // screenTime is the one type absent from DEFAULT_ENABLED, so it is the
    // honest "not yet added" case.
    const store = seedAsyncStorage(legacy(['battery', 'weather']));
    const { getByLabelText } = render(<WidgetGallery visible onClose={jest.fn()} />);

    await waitFor(() => expect(getByLabelText('Add Screen Time widget')).toBeTruthy());
    fireEvent.press(getByLabelText('Add Screen Time widget'));

    await waitFor(() =>
      expect(writtenTypes(store)).toEqual(['battery', 'weather', 'screenTime']),
    );
  });

  it('gives each placed widget a distinct, stable id', async () => {
    // The id is what a move, a resize and a remove all address. Without it the
    // only handle on a widget is its type, which is exactly the limitation
    // #933 removes.
    const store = seedAsyncStorage(legacy(['battery', 'weather']));
    const { getByLabelText } = render(<WidgetGallery visible onClose={jest.fn()} />);

    await waitFor(() => expect(getByLabelText('Add Weather widget')).toBeTruthy());
    fireEvent.press(getByLabelText('Add Weather widget'));

    await waitFor(() => expect(written(store)).toHaveLength(3));
    const ids = written(store)!.map((i) => i.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('places a SECOND widget of a type that is already there', async () => {
    // Two Weather widgets, two cities. Under the old type-set model this was
    // not expressible: the type was already on, so there was nothing to add.
    const store = seedAsyncStorage(legacy(['weather']));
    const { getByLabelText } = render(<WidgetGallery visible onClose={jest.fn()} />);

    await waitFor(() => expect(getByLabelText('Add Weather widget')).toBeTruthy());
    fireEvent.press(getByLabelText('Add Weather widget'));

    await waitFor(() => expect(writtenTypes(store)).toEqual(['weather', 'weather']));
  });

  it('carries the per-type default size onto the placed instance', async () => {
    // Size is a property of the instance now, seeded from the type's default —
    // which is all a per-type table can honestly mean once #937 lets the user
    // change it.
    const store = seedAsyncStorage(legacy([]));
    const { getByLabelText } = render(<WidgetGallery visible onClose={jest.fn()} />);

    await waitFor(() => expect(getByLabelText('Add Weather widget')).toBeTruthy());
    fireEvent.press(getByLabelText('Add Weather widget'));

    await waitFor(() => expect(written(store)).toHaveLength(1));
    expect(written(store)![0].size).toBe('medium');
  });

  it('leaves the pre-#933 key untouched, so a rollback keeps its widgets', async () => {
    // The migration writes to a new key. Overwriting the old one in place would
    // strand anyone who installs this version and then goes back.
    const store = seedAsyncStorage(legacy(['battery', 'weather']));
    const { getByLabelText } = render(<WidgetGallery visible onClose={jest.fn()} />);

    await waitFor(() => expect(getByLabelText('Add Screen Time widget')).toBeTruthy());
    fireEvent.press(getByLabelText('Add Screen Time widget'));

    await waitFor(() => expect(written(store)).toHaveLength(3));
    expect(JSON.parse(store.get(WIDGET_CONFIG_KEY)!)).toEqual(['battery', 'weather']);
  });

  it('removes an added widget from the persisted config', async () => {
    const store = seedAsyncStorage(legacy(['battery', 'weather', 'storage']));
    const { getByLabelText } = render(<WidgetGallery visible onClose={jest.fn()} />);

    await waitFor(() => expect(getByLabelText('Remove Weather widget')).toBeTruthy());
    fireEvent.press(getByLabelText('Remove Weather widget'));

    await waitFor(() => expect(writtenTypes(store)).toEqual(['battery', 'storage']));
  });

  it('offers Remove ALONGSIDE Add for a widget that is already placed', async () => {
    // Not instead of. The gallery used to swap one button for the other, which
    // is what made a second copy of a type impossible to ask for.
    seedAsyncStorage(legacy(['battery']));
    const { getByLabelText } = render(<WidgetGallery visible onClose={jest.fn()} />);

    await waitFor(() => expect(getByLabelText('Remove Battery widget')).toBeTruthy());
    expect(getByLabelText('Add Battery widget')).toBeTruthy();
  });

  it('offers no Remove for a type that is not placed', async () => {
    seedAsyncStorage(legacy([]));
    const { getByLabelText, queryByLabelText } = render(
      <WidgetGallery visible onClose={jest.fn()} />,
    );

    await waitFor(() => expect(getByLabelText('Add Battery widget')).toBeTruthy());
    expect(queryByLabelText('Remove Battery widget')).toBeNull();
  });

  it('removing one of several leaves the rest in place', async () => {
    // Removes the last placed instance of the type: with several of a kind, the
    // one just added is the one most likely being undone.
    const store = seedAsyncStorage(legacy(['weather', 'battery']));
    const { getByLabelText } = render(<WidgetGallery visible onClose={jest.fn()} />);

    await waitFor(() => expect(getByLabelText('Add Weather widget')).toBeTruthy());
    fireEvent.press(getByLabelText('Add Weather widget'));
    await waitFor(() => expect(written(store)).toHaveLength(3));

    fireEvent.press(getByLabelText('Remove Weather widget'));
    await waitFor(() => expect(writtenTypes(store)).toEqual(['weather', 'battery']));
  });

  it('reports how many widgets are currently added', async () => {
    seedAsyncStorage(legacy(['battery', 'weather']));
    const { getByLabelText } = render(<WidgetGallery visible onClose={jest.fn()} />);
    await waitFor(() => expect(getByLabelText('2 widgets added')).toBeTruthy());
  });

  it('calls onClose from the close button', async () => {
    seedAsyncStorage();
    const onClose = jest.fn();
    const { getByLabelText } = render(<WidgetGallery visible onClose={onClose} />);
    await waitFor(() => expect(getByLabelText('Close widget gallery')).toBeTruthy());
    fireEvent.press(getByLabelText('Close widget gallery'));
    expect(onClose).toHaveBeenCalled();
  });

  it('labels every entry with the same name the Today View panel uses', async () => {
    seedAsyncStorage(legacy([]));
    const { getByTestId } = render(<WidgetGallery visible onClose={jest.fn()} />);
    await waitFor(() => expect(getByTestId('widget-gallery-entry-battery')).toBeTruthy());
    for (const type of ALL_WIDGET_TYPES) {
      // Scoped to the entry: several widgets print their own name inside the
      // live preview too (the Battery widget is titled "Battery"), so a
      // screen-wide getByText would be ambiguous rather than wrong.
      const entry = within(getByTestId(`widget-gallery-entry-${type}`));
      expect(entry.getAllByText(WIDGET_LABELS[type]).length).toBeGreaterThan(0);
    }
  });
});
