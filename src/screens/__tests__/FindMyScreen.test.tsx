import React from 'react';
import { waitFor, fireEvent, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render } from '../../test-utils';
import { FindMyScreen } from '../FindMyScreen';

// AllProviders (in test-utils) already wraps with ThemeProvider,
// DeviceProvider and LocationProvider, so we render FindMyScreen directly.
// The permission state defaults to 'granted' in jest.setup.js (mocked
// getForegroundPermissionsAsync returns status 'granted'); the denied /
// undetermined paths are exercised by overriding the mock per-test.

const ITEMS_KEY = '@iostoandroid/findmy_items';

function renderFindMy() {
  return render(<FindMyScreen />);
}

describe('FindMyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the "Find My" title', async () => {
    const { getAllByText } = renderFindMy();
    await waitFor(() => expect(getAllByText('Find My').length).toBeGreaterThan(0));
  });

  it('renders a "This Device" row with coordinates when permission is granted', async () => {
    const { getByText, getAllByText } = renderFindMy();
    await waitFor(() => expect(getByText('This Device')).toBeTruthy());
    // Mocked coords from jest.setup.js: 37.7749, -122.4194
    await waitFor(() => expect(getAllByText(/37\.7749, -122\.4194/).length).toBeGreaterThan(0));
    // Updated relative label should be present.
    await waitFor(() => expect(getByText(/Updated .* ago/)).toBeTruthy());
  });

  it('renders the "Grant Location Permission" button when permission is undetermined', async () => {
    const loc = jest.requireMock('expo-location');
    jest.spyOn(loc, 'getForegroundPermissionsAsync').mockResolvedValue({ status: 'undetermined' });

    const { getByText } = renderFindMy();
    const button = await waitFor(() => getByText('Grant Location Permission'));
    expect(button).toBeTruthy();
    // The device row should not be shown while permission is not granted.
    expect(() => getByText('This Device')).toThrow();
  });

  it('pressing the grant button calls requestPermission', async () => {
    const loc = jest.requireMock('expo-location');
    jest.spyOn(loc, 'getForegroundPermissionsAsync').mockResolvedValue({ status: 'denied' });
    const requestSpy = jest.spyOn(loc, 'requestForegroundPermissionsAsync');

    const { getByText } = renderFindMy();
    const button = await waitFor(() => getByText('Grant Location Permission'));
    fireEvent.press(button);
    await waitFor(() => expect(requestSpy).toHaveBeenCalled());
  });
});

// ─── Items tab (tracked inventory) — local CRUD, persisted to AsyncStorage ───
// This tab is inventory-only: it must never claim to locate, range, or map a
// physical tag (there is no AirTag-equivalent hardware this app can drive).
describe('FindMyScreen — Items tab (tracked inventory)', () => {
  let store: Record<string, string | null>;

  beforeEach(() => {
    store = {};
    (AsyncStorage.getItem as jest.Mock).mockImplementation((k: string) =>
      Promise.resolve(store[k] ?? null)
    );
    (AsyncStorage.setItem as jest.Mock).mockImplementation((k: string, v: string) => {
      store[k] = v;
      return Promise.resolve();
    });
    (AsyncStorage.removeItem as jest.Mock).mockImplementation((k: string) => {
      delete store[k];
      return Promise.resolve();
    });
  });

  // The Items tab is the non-default tab; switch to it first.
  async function openItemsTab() {
    const screen = renderFindMy();
    const itemsTab = await screen.findByText('Items');
    fireEvent.press(itemsTab);
    return screen;
  }

  it('renders the inventory empty state when there are no items', async () => {
    const screen = await openItemsTab();
    await waitFor(() => expect(screen.getByText('No Tracked Items')).toBeTruthy());
  });

  it('adds an item via the sheet, appends it to the list, and persists it', async () => {
    const screen = await openItemsTab();
    const addBtn = await screen.findByText('Add Item');
    fireEvent.press(addBtn);

    const input = await screen.findByPlaceholderText('Item name');
    fireEvent.changeText(input, 'House Keys');
    const iconChoice = await screen.findByLabelText('Select key icon');
    fireEvent.press(iconChoice);
    const confirm = await screen.findByText('Add');
    fireEvent.press(confirm);

    await waitFor(() => expect(screen.getByText('House Keys')).toBeTruthy());
    // Subtitle reads the relative "added" date.
    expect(screen.getByText(/Added .+/)).toBeTruthy();

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        ITEMS_KEY,
        expect.stringContaining('House Keys')
      )
    );
  });

  it('deletes an item from the list and removes it from AsyncStorage', async () => {
    store[ITEMS_KEY] = JSON.stringify([
      { id: 'x1', name: 'Bike', icon: 'bicycle', addedAt: Date.now() },
    ]);
    const screen = await openItemsTab();
    await waitFor(() => expect(screen.getByText('Bike')).toBeTruthy());

    const del = screen.getByText('Delete');
    fireEvent.press(del);

    await waitFor(() => expect(screen.queryByText('Bike')).toBeNull());
    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        ITEMS_KEY,
        expect.not.stringContaining('Bike')
      )
    );
  });

  it('persists items across a remount (hydration from AsyncStorage)', async () => {
    const screen = await openItemsTab();
    const addBtn = await screen.findByText('Add Item');
    fireEvent.press(addBtn);
    const input = await screen.findByPlaceholderText('Item name');
    fireEvent.changeText(input, 'Backpack');
    fireEvent.press(await screen.findByText('Add'));

    await waitFor(() => expect(screen.getByText('Backpack')).toBeTruthy());
    screen.unmount();

    const screen2 = await openItemsTab();
    await waitFor(() => expect(screen2.getByText('Backpack')).toBeTruthy());
  });

  it('never renders a locate / find / distance action for any item (regression guard)', async () => {
    store[ITEMS_KEY] = JSON.stringify([
      { id: 'x2', name: 'Wallet', icon: 'briefcase', addedAt: Date.now() },
    ]);
    const screen = await openItemsTab();
    await waitFor(() => expect(screen.getByText('Wallet')).toBeTruthy());

    const itemsTabView = screen.getByTestId('items-tab');
    expect(within(itemsTabView).queryByText(/Find|Locate|distance/i)).toBeNull();
    expect(within(itemsTabView).queryByLabelText(/locate|find/i)).toBeNull();
  });
});
