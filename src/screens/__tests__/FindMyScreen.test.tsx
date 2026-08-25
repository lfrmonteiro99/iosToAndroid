import React from 'react';
import { waitFor, fireEvent, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render } from '../../test-utils';
import type { RenderAPI } from '@testing-library/react-native';
import { FindMyScreen } from '../FindMyScreen';
import type { AppNavigationProp } from '../../navigation/types';
import * as ContactsStore from '../../store/ContactsStore';

// expo-notifications is mocked locally (same shape as RemindersScreen.test.tsx)
// so no shared jest.setup mock changes — ClockScreen's alarm tests keep their
// own mock untouched.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted', canAskAgain: true })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notification-id')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', DATE: 'date', CALENDAR: 'calendar' },
}));

// useAlert() resolves to a no-op in AllProviders (test-utils does not mount
// AlertProvider), so capture it here to assert what the user is told.
const mockAlert = jest.fn();
jest.mock('../../components', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const actual = jest.requireActual('../../components');
  return { ...actual, useAlert: () => mockAlert };
});

// AllProviders (in test-utils) already wraps with ThemeProvider,
// DeviceProvider, LocationProvider and ContactsProvider, so we render
// FindMyScreen directly. The permission state defaults to 'granted' in
// jest.setup.js (mocked getForegroundPermissionsAsync returns status
// 'granted'); the denied / undetermined paths are exercised by overriding
// the mock per-test. ContactsStore is seeded with 7 favorites (ids
// 1,3,7,10,13,20,26) unless a test mocks useContacts().

const ITEMS_KEY = '@iostoandroid/findmy_items';
const LOST_MODE_KEY = '@iostoandroid/findmy_lost_mode';

const mockNavigation: AppNavigationProp = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as unknown as AppNavigationProp;

function renderFindMy(): RenderAPI {
  return render(<FindMyScreen navigation={mockNavigation} />);
}

// Returns the shared AsyncStorage mock so individual tests can seed storage.
function getAsyncStorage() {
  return jest.requireMock('@react-native-async-storage/async-storage').default;
}

describe('FindMyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no persisted lost-mode state. Intercept only our key so other
    // providers (DeviceStore's timezone sync, etc.) keep their default
    // read behaviour.
    const asyncStorage = getAsyncStorage();
    asyncStorage.getItem.mockImplementation((key: string) =>
      key === LOST_MODE_KEY ? Promise.resolve(null) : Promise.resolve(null),
    );
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
    jest.spyOn(loc, 'getForegroundPermissionsAsync').mockResolvedValueOnce({ status: 'undetermined' });

    const { getByText } = renderFindMy();
    const button = await waitFor(() => getByText('Grant Location Permission'));
    expect(button).toBeTruthy();
    // The device row should not be shown while permission is not granted.
    expect(() => getByText('This Device')).toThrow();
  });

  it('pressing the grant button calls requestPermission', async () => {
    const loc = jest.requireMock('expo-location');
    jest.spyOn(loc, 'getForegroundPermissionsAsync').mockResolvedValueOnce({ status: 'denied' });
    const requestSpy = jest.spyOn(loc, 'requestForegroundPermissionsAsync');

    const { getByText } = renderFindMy();
    const button = await waitFor(() => getByText('Grant Location Permission'));
    fireEvent.press(button);
    await waitFor(() => expect(requestSpy).toHaveBeenCalled());
  });

  it('renders a "Location History" entry point in the Devices tab that navigates', async () => {
    const { getByText } = renderFindMy();
    // Defaults to the Devices tab, where permission is granted (mock).
    await waitFor(() => expect(getByText('This Device')).toBeTruthy());

    const tile = await waitFor(() => getByText('Location History'));
    expect(tile).toBeTruthy();

    fireEvent.press(tile);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('FindMyLocationHistory');
  });

  it('does not render the "Location History" tile before permission is granted', async () => {
    const loc = jest.requireMock('expo-location');
    jest.spyOn(loc, 'getForegroundPermissionsAsync').mockResolvedValueOnce({ status: 'undetermined' });

    const { queryByText } = renderFindMy();
    await waitFor(() => expect(queryByText('Grant Location Permission')).toBeTruthy());
    // The Devices list (with the new tile) only renders once granted.
    expect(queryByText('Location History')).toBeNull();
  });

  // ─── Lost mode (issue #267) ─────────────────────────────────────────────

  it('does not show the lost-mode overlay when lost mode is inactive', async () => {
    const asyncStorage = getAsyncStorage();
    asyncStorage.getItem.mockImplementation((key: string) =>
      key === LOST_MODE_KEY
        ? Promise.resolve(JSON.stringify({ active: false, message: '' }))
        : Promise.resolve(null),
    );

    const { queryByText } = renderFindMy();
    await waitFor(() => expect(queryByText('This Device')).toBeTruthy());
    // Overlay copy must be absent while inactive.
    expect(queryByText('This Device Is Marked as Lost')).toBeNull();
  });

  it('toggling "Mark as Lost" on opens the message prompt', async () => {
    const { getByText, getByRole, getByPlaceholderText } = renderFindMy();
    await waitFor(() => expect(getByText('Mark as Lost')).toBeTruthy());

    fireEvent.press(getByRole('switch'));

    // The prompt captures an optional contact message.
    const field = await waitFor(() => getByPlaceholderText('Contact message (optional)'));
    expect(field).toBeTruthy();
    // Note: this is a prompt, not the overlay yet.
    expect(getByText('Lost Mode')).toBeTruthy();
  });

  it('toggling "Mark as Lost" on persists { active: true, message } and shows the overlay', async () => {
    const asyncStorage = getAsyncStorage();

    const { getByText, getByPlaceholderText, getByRole } = renderFindMy();
    await waitFor(() => expect(getByText('Mark as Lost')).toBeTruthy());

    // Open the prompt and type a contact note.
    fireEvent.press(getByRole('switch'));
    const field = await waitFor(() => getByPlaceholderText('Contact message (optional)'));
    fireEvent.changeText(field, 'Call 555-0199');

    fireEvent.press(getByText('Save'));

    // The overlay must appear.
    await waitFor(() => expect(getByText('This Device Is Marked as Lost')).toBeTruthy());
    // The stored message must be surfaced (overlay copy is uniquely labelled).
    expect(getByText('Reach me: Call 555-0199')).toBeTruthy();
    // The in-app-only limitation must be visible to the user.
    expect(getByText('This does not lock your device')).toBeTruthy();

    // Persisted flag must be active:true with the message.
    await waitFor(() =>
      expect(asyncStorage.setItem).toHaveBeenCalledWith(
        LOST_MODE_KEY,
        expect.stringContaining('"active":true'),
      ),
    );
    expect(asyncStorage.setItem).toHaveBeenCalledWith(
      LOST_MODE_KEY,
      expect.stringContaining('Call 555-0199'),
    );
  });

  it('the overlay "Turn Off Lost Mode" button hides the overlay and persists active:false', async () => {
    const asyncStorage = getAsyncStorage();
    asyncStorage.getItem.mockImplementation((key: string) =>
      key === LOST_MODE_KEY
        ? Promise.resolve(JSON.stringify({ active: true, message: 'Call 555-0199' }))
        : Promise.resolve(null),
    );

    const { getByText, queryByText } = renderFindMy();
    // Overlay is shown immediately on mount because the flag is active.
    await waitFor(() => expect(getByText('This Device Is Marked as Lost')).toBeTruthy());

    fireEvent.press(getByText('Turn Off Lost Mode'));

    await waitFor(() =>
      expect(queryByText('This Device Is Marked as Lost')).toBeNull(),
    );
    await waitFor(() =>
      expect(asyncStorage.setItem).toHaveBeenCalledWith(
        LOST_MODE_KEY,
        expect.stringContaining('"active":false'),
      ),
    );
  });

  it('reappears on remount when the flag was left active', async () => {
    const asyncStorage = getAsyncStorage();
    asyncStorage.getItem.mockImplementation((key: string) =>
      key === LOST_MODE_KEY
        ? Promise.resolve(JSON.stringify({ active: true, message: 'Call 555-0199' }))
        : Promise.resolve(null),
    );

    const first = renderFindMy();
    await waitFor(() => expect(first.getByText('This Device Is Marked as Lost')).toBeTruthy());
    first.unmount();

    // Remount (simulating navigating away and back to Find My).
    const second = renderFindMy();
    await waitFor(() => expect(second.getByText('This Device Is Marked as Lost')).toBeTruthy());
    expect(second.getByText('Reach me: Call 555-0199')).toBeTruthy();
  });
});

describe('FindMyScreen tabs (issue #264)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The tests in the first describe block override expo-location's
    // getForegroundPermissionsAsync with mockResolvedValue (undetermined /
    // denied). clearAllMocks resets the call log but NOT the implementation,
    // so that leak would make the Devices tab here read "denied" and never
    // show the device row. Re-establish a granted default on every tab test
    // so each starts from the real default state.
    const loc = jest.requireMock('expo-location');
    jest.spyOn(loc, 'getForegroundPermissionsAsync').mockResolvedValue({ status: 'granted' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders a segmented control with Devices, People, Items and defaults to Devices', async () => {
    const { getByText } = renderFindMy();
    await waitFor(() => expect(getByText('Devices')).toBeTruthy());
    expect(getByText('People')).toBeTruthy();
    expect(getByText('Items')).toBeTruthy();

    // Default tab is Devices: device row is visible, People content is not.
    await waitFor(() => expect(getByText('This Device')).toBeTruthy());
    expect(() => getByText('Location Sharing Unavailable')).toThrow();
  });

  it('People tab shows one row per ContactsStore favorite with "Location Sharing Unavailable"', async () => {
    const { getByText, getAllByText } = renderFindMy();

    fireEvent.press(await waitFor(() => getByText('People')));
    await waitFor(() => expect(getByText('Alice Anderson')).toBeTruthy());

    // Every seeded favorite appears as a row.
    expect(getByText('Alice Anderson')).toBeTruthy();
    expect(getByText('Charlie Chen')).toBeTruthy();
    expect(getByText('George Garcia')).toBeTruthy();
    expect(getByText('Julia James')).toBeTruthy();
    expect(getByText('Michael Moore')).toBeTruthy();
    expect(getByText('Teresa Taylor')).toBeTruthy();
    expect(getByText('Zachary Zhang')).toBeTruthy();

    // One honest "unavailable" subtitle per favorite (7 seeded favorites).
    await waitFor(() =>
      expect(getAllByText('Location Sharing Unavailable').length).toBe(7),
    );
  });

  it('People tab never renders a coordinate, distance, or "last seen" value for a contact', async () => {
    const { getByText, queryByText, getAllByText } = renderFindMy();

    fireEvent.press(await waitFor(() => getByText('People')));
    await waitFor(() => expect(getByText('Alice Anderson')).toBeTruthy());

    // The device's live coordinate must NOT leak into the People tab.
    expect(queryByText(/37\.7749, -122\.4194/)).toBeNull();
    // No fake "last seen" / "updated" label for a contact.
    expect(queryByText(/Updated .* ago/)).toBeNull();
    // Every favorite subtitle is exactly the honest unavailable string — no
    // silent fabrication of coordinates or distance.
    expect(getAllByText('Location Sharing Unavailable').length).toBe(7);
  });

  it('People tab shows the empty state when ContactsStore has no favorites', async () => {
    jest.spyOn(ContactsStore, 'useContacts').mockReturnValue({
      contacts: [],
      favorites: [],
      deviceFavoriteIds: [],
      addContact: jest.fn(),
      updateContact: jest.fn(),
      deleteContact: jest.fn(),
      toggleFavorite: jest.fn(),
      getContact: jest.fn(),
      reset: jest.fn(),
      isReady: true,
    });

    const { getByText, queryByText } = renderFindMy();

    fireEvent.press(await waitFor(() => getByText('People')));
    await waitFor(() => expect(getByText('No One Is Sharing Their Location')).toBeTruthy());
    // No fake favorite rows when there are none.
    expect(queryByText('Location Sharing Unavailable')).toBeNull();
  });

  it('Items tab shows the empty placeholder', async () => {
    const { getByText } = renderFindMy();

    fireEvent.press(await waitFor(() => getByText('Items')));
    await waitFor(() => expect(getByText('No Items')).toBeTruthy());
    expect(
      getByText("Item tracking requires hardware like AirTags, which this app can't detect."),
    ).toBeTruthy();
  });

  it('switching away from and back to Devices preserves the Devices content', async () => {
    const { getByText, getAllByText } = renderFindMy();

    // Go to People, confirm device row is gone.
    fireEvent.press(await waitFor(() => getByText('People')));
    await waitFor(() => expect(getByText('Alice Anderson')).toBeTruthy());
    expect(() => getByText('This Device')).toThrow();

    // Back to Devices: device row + coordinates return, People content gone.
    fireEvent.press(getByText('Devices'));
    await waitFor(() => expect(getByText('This Device')).toBeTruthy());
    await waitFor(() => expect(getAllByText(/37\.7749, -122\.4194/).length).toBeGreaterThan(0));
    expect(() => getByText('Location Sharing Unavailable')).toThrow();
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

  it('renders the Add Item button and the #264 empty state when there are no items', async () => {
    const screen = await openItemsTab();
    // The zero-items case keeps the honest placeholder from #264 — no fake
    // tracking claims — and the CRUD entry point sits above it.
    await waitFor(() => expect(screen.getByText('No Items')).toBeTruthy());
    expect(screen.getByText('Add Item')).toBeTruthy();
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

// ─── Play Sound on this device (issue #266) ──────────────────────────────────
// The feature is honestly scoped to the CURRENT device: without a backend and a
// companion device there is nothing else to reach. These tests pin the
// permission-granted path, the permission-denied path (which must not schedule
// anything, and must not fail silently), and the scoping guard.
describe('FindMyScreen — Play Sound (issue #266)', () => {
  const notif = jest.requireMock('expo-notifications');

  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    notif.getPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    notif.requestPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    notif.scheduleNotificationAsync.mockResolvedValue('notif-id');
    mockAlert.mockClear();
  });

  it('shows a "Play Sound" row on the Devices tab', async () => {
    const { getByText } = renderFindMy();
    await waitFor(() => expect(getByText('Play Sound')).toBeTruthy());
  });

  it('pressing it with permission granted schedules a notification with sound and confirms', async () => {
    const { getByText } = renderFindMy();
    fireEvent.press(await waitFor(() => getByText('Play Sound')));

    await waitFor(() => expect(notif.scheduleNotificationAsync).toHaveBeenCalledTimes(1));
    const arg = notif.scheduleNotificationAsync.mock.calls[0][0];
    expect(arg.content.sound).toBe(true);
    expect(arg.trigger.type).toBe('timeInterval');
    expect(arg.trigger.seconds).toBeGreaterThan(0);
    await waitFor(() =>
      expect(mockAlert.mock.calls.some(([title]) => title === 'Playing Sound')).toBe(true),
    );
  });

  it('does not re-prompt when permission is already granted', async () => {
    const { getByText } = renderFindMy();
    fireEvent.press(await waitFor(() => getByText('Play Sound')));
    await waitFor(() => expect(notif.scheduleNotificationAsync).toHaveBeenCalled());
    expect(notif.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests permission when undetermined and schedules once granted', async () => {
    notif.getPermissionsAsync.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    const { getByText } = renderFindMy();
    fireEvent.press(await waitFor(() => getByText('Play Sound')));

    await waitFor(() => expect(notif.requestPermissionsAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(notif.scheduleNotificationAsync).toHaveBeenCalledTimes(1));
  });

  it('with permission denied it schedules nothing and explains why (no silent no-op)', async () => {
    notif.getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });
    notif.requestPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });

    const { getByText } = renderFindMy();
    fireEvent.press(await waitFor(() => getByText('Play Sound')));

    await waitFor(() =>
      expect(mockAlert.mock.calls.some(([, message]) => /notification/i.test(String(message)))).toBe(
        true,
      ),
    );
    expect(notif.scheduleNotificationAsync).not.toHaveBeenCalled();
    // Inverse of the fix: the success confirmation must stay hidden.
    expect(mockAlert.mock.calls.some(([title]) => title === 'Playing Sound')).toBe(false);
  });

  it('a scheduling failure surfaces an alert instead of being swallowed', async () => {
    notif.scheduleNotificationAsync.mockRejectedValue(new Error('boom'));
    const { getByText } = renderFindMy();
    fireEvent.press(await waitFor(() => getByText('Play Sound')));

    await waitFor(() =>
      expect(mockAlert.mock.calls.some(([title]) => /Could Not Play Sound/i.test(String(title)))).toBe(
        true,
      ),
    );
    expect(mockAlert.mock.calls.some(([title]) => title === 'Playing Sound')).toBe(false);
  });

  it('a double press schedules exactly one notification (no duplicate alert)', async () => {
    const { getByText } = renderFindMy();
    const row = await waitFor(() => getByText('Play Sound'));
    fireEvent.press(row);
    fireEvent.press(row);

    await waitFor(() => expect(notif.scheduleNotificationAsync).toHaveBeenCalled());
    expect(notif.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('the row is hidden while location permission is not granted', async () => {
    const loc = jest.requireMock('expo-location');
    jest.spyOn(loc, 'getForegroundPermissionsAsync').mockResolvedValueOnce({ status: 'denied' });
    const { getByText, queryByText } = renderFindMy();
    await waitFor(() => expect(getByText('Grant Location Permission')).toBeTruthy());
    expect(queryByText('Play Sound')).toBeNull();
  });

  it('no tab offers to play a sound on another person\u2019s or another device (regression guard)', async () => {
    const { getByText, queryByText } = renderFindMy();
    await waitFor(() => expect(getByText('Play Sound')).toBeTruthy());
    // The only sound affordance is scoped to this device.
    expect(queryByText(/Play Sound on/i)).toBeNull();

    fireEvent.press(getByText('People'));
    await waitFor(() => expect(queryByText('Play Sound')).toBeNull());

    fireEvent.press(getByText('Items'));
    await waitFor(() => expect(queryByText('Play Sound')).toBeNull());
  });
});
