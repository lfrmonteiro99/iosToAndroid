import React from 'react';
import { waitFor, fireEvent } from '@testing-library/react-native';
import { render } from '../../test-utils';
import { FindMyScreen } from '../FindMyScreen';

// AllProviders (in test-utils) already wraps with ThemeProvider,
// DeviceProvider and LocationProvider, so we render FindMyScreen directly.
// The permission state defaults to 'granted' in jest.setup.js (mocked
// getForegroundPermissionsAsync returns status 'granted'); the denied /
// undetermined paths are exercised by overriding the mock per-test.

const LOST_MODE_KEY = '@iostoandroid/findmy_lost_mode';

function renderFindMy() {
  return render(<FindMyScreen />);
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
