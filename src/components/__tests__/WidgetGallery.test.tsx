/**
 * #936 — the gallery must place a new widget on the page the user is viewing
 * (the `focusPage` it is opened from), not leave it PAGE_UNPLACED. The screen
 * passes `focusPage`, `cols` and `rows`; the gallery routes placement through
 * `resolveWidgetPlacement`, which prefers `focusPage` and overflows forward
 * (telling the user) only when that page is full.
 *
 * These tests render the REAL WidgetGallery with the REAL useWidgetConfig
 * (backed by AsyncStorage), so `addWidget` actually persists — we assert on
 * the storage the gallery wrote, not on a mock of the inner function.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, fireEvent, waitFor } from '../../test-utils';
import { WidgetGallery } from '../WidgetGallery';

const WIDGET_INSTANCES_KEY = '@iostoandroid/widget_instances';

const mockAlert = jest.fn();
jest.mock('../AlertProvider', () => ({
  useAlert: () => mockAlert,
}));

function seedInstances(list: unknown[]) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    key === WIDGET_INSTANCES_KEY ? Promise.resolve(JSON.stringify(list)) : Promise.resolve(null),
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation(() => Promise.resolve());
}

function renderGallery(props: Partial<{ focusPage: number; cols: number; rows: number }> = {}) {
  return render(
    <WidgetGallery
      visible
      onClose={jest.fn()}
      focusPage={props.focusPage ?? 0}
      cols={props.cols ?? 4}
      rows={props.rows ?? 6}
    />,
  );
}

/** Reads whatever the gallery persisted through addWidget. */
async function persistedInstances(): Promise<Array<{ id: string; type: string; page: number }>> {
  const calls = (AsyncStorage.setItem as jest.Mock).mock.calls;
  const written = calls.find((c) => c[0] === WIDGET_INSTANCES_KEY);
  if (!written) return [];
  return JSON.parse(written[1]);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAlert.mockClear();
  seedInstances([]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('WidgetGallery placement (#936)', () => {
  it('places a new widget on the focused page (page 0)', async () => {
    const { getByLabelText } = renderGallery({ focusPage: 0 });
    await waitFor(() => expect(getByLabelText('Add Weather widget')).toBeTruthy());

    fireEvent.press(getByLabelText('Add Weather widget'));

    await waitFor(async () => {
      const written = await persistedInstances();
      expect(written).toHaveLength(1);
      expect(written[0].type).toBe('weather');
      expect(written[0].page).toBe(0);
    });
  });

  it('places a new widget on a non-zero focused page', async () => {
    const { getByLabelText } = renderGallery({ focusPage: 2 });
    await waitFor(() => expect(getByLabelText('Add Battery widget')).toBeTruthy());

    fireEvent.press(getByLabelText('Add Battery widget'));

    await waitFor(async () => {
      const written = await persistedInstances();
      expect(written).toHaveLength(1);
      expect(written[0].page).toBe(2);
    });
  });

  it('overflows to the next page and informs the user when the focused page is full', async () => {
    // Page 0 is completely full: a large (4x4, rows 0-3) plus a medium (4x2,
    // rows 4-5) occupy all 24 cells of a 4x6 grid. A newly added widget cannot
    // fit there, so it must move to page 1 and the user must be told.
    seedInstances([
      { id: 'weather-0', type: 'weather', size: 'large', page: 0, col: 0, row: 0 },
      { id: 'upnext-0', type: 'upNext', size: 'medium', page: 0, col: 0, row: 4 },
    ]);

    const { getByLabelText } = renderGallery({ focusPage: 0 });
    await waitFor(() => expect(getByLabelText('Add Battery widget')).toBeTruthy());

    fireEvent.press(getByLabelText('Add Battery widget'));

    await waitFor(async () => {
      const written = await persistedInstances();
      expect(written.length).toBeGreaterThanOrEqual(3);
      const added = written.find((w) => w.id.startsWith('battery'))!;
      expect(added.page).toBe(1);
    });
    expect(mockAlert).toHaveBeenCalled();
  });

  it('does NOT overflow when the focused page still has room', async () => {
    // A small widget on page 0 leaves room below for another — no alert.
    seedInstances([{ id: 'weather-0', type: 'weather', size: 'small', page: 0, col: 0, row: 0 }]);

    const { getByLabelText } = renderGallery({ focusPage: 0 });
    await waitFor(() => expect(getByLabelText('Add Battery widget')).toBeTruthy());

    fireEvent.press(getByLabelText('Add Battery widget'));

    await waitFor(async () => {
      const written = await persistedInstances();
      expect(written).toHaveLength(2);
      const added = written.find((w) => w.id !== 'weather-0')!;
      expect(added.page).toBe(0);
    });
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('does not say "first home page" anywhere in the sheet', async () => {
    const { queryByText } = renderGallery({ focusPage: 1 });
    await waitFor(() => expect(queryByText('Widgets')).toBeTruthy());
    expect(queryByText(/first home page/i)).toBeNull();
  });
});
