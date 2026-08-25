import React from 'react';
import { render, fireEvent, waitFor, within } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WidgetGallery } from '../WidgetGallery';
import { WIDGET_CONFIG_KEY, ALL_WIDGET_TYPES, WIDGET_LABELS } from '../../widgets/TodayWidgets';

// The gallery persists through useWidgetConfig -> saveWidgetConfig, so the
// assertions here are about what lands in AsyncStorage under the SAME key the
// Today View panel and the home row read. A gallery that changed some other
// state would look right on screen and add nothing to the home screen.
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

function written(store: Map<string, string>): string[] | null {
  const raw = store.get(WIDGET_CONFIG_KEY);
  return raw ? (JSON.parse(raw) as string[]) : null;
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
    const store = seedAsyncStorage({
      [WIDGET_CONFIG_KEY]: JSON.stringify(['battery', 'weather']),
    });
    const { getByLabelText } = render(<WidgetGallery visible onClose={jest.fn()} />);

    await waitFor(() => expect(getByLabelText('Add Screen Time widget')).toBeTruthy());
    fireEvent.press(getByLabelText('Add Screen Time widget'));

    await waitFor(() => expect(written(store)).toEqual(['battery', 'weather', 'screenTime']));
  });

  it('removes an added widget from the persisted config', async () => {
    const store = seedAsyncStorage({
      [WIDGET_CONFIG_KEY]: JSON.stringify(['battery', 'weather', 'storage']),
    });
    const { getByLabelText } = render(<WidgetGallery visible onClose={jest.fn()} />);

    await waitFor(() => expect(getByLabelText('Remove Weather widget')).toBeTruthy());
    fireEvent.press(getByLabelText('Remove Weather widget'));

    await waitFor(() => expect(written(store)).toEqual(['battery', 'storage']));
  });

  it('offers Remove (not Add) for a widget that is already on', async () => {
    seedAsyncStorage({ [WIDGET_CONFIG_KEY]: JSON.stringify(['battery']) });
    const { getByLabelText, queryByLabelText } = render(
      <WidgetGallery visible onClose={jest.fn()} />,
    );
    await waitFor(() => expect(getByLabelText('Remove Battery widget')).toBeTruthy());
    expect(queryByLabelText('Add Battery widget')).toBeNull();
  });

  it('adding the same widget twice cannot duplicate it', async () => {
    const store = seedAsyncStorage({ [WIDGET_CONFIG_KEY]: JSON.stringify([]) });
    const { getByLabelText } = render(<WidgetGallery visible onClose={jest.fn()} />);

    await waitFor(() => expect(getByLabelText('Add Battery widget')).toBeTruthy());
    fireEvent.press(getByLabelText('Add Battery widget'));
    await waitFor(() => expect(written(store)).toEqual(['battery']));
    // The entry now offers Remove, so a second add is not even reachable — this
    // asserts the guard in `add` rather than the absence of the button.
    expect(written(store)).toEqual(['battery']);
  });

  it('reports how many widgets are currently added', async () => {
    seedAsyncStorage({ [WIDGET_CONFIG_KEY]: JSON.stringify(['battery', 'weather']) });
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
    seedAsyncStorage({ [WIDGET_CONFIG_KEY]: JSON.stringify([]) });
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
