import React from 'react';
import { waitFor, fireEvent } from '@testing-library/react-native';
import { render } from '../../test-utils';
import type { RenderAPI } from '@testing-library/react-native';
import { FindMyScreen } from '../FindMyScreen';
import * as ContactsStore from '../../store/ContactsStore';

// AllProviders (in test-utils) already wraps with ThemeProvider,
// DeviceProvider, LocationProvider and ContactsProvider, so we render
// FindMyScreen directly. The permission state defaults to 'granted' in
// jest.setup.js (mocked getForegroundPermissionsAsync returns status
// 'granted'); the denied / undetermined paths are exercised by overriding
// the mock per-test. ContactsStore is seeded with 7 favorites (ids
// 1,3,7,10,13,20,26) unless a test mocks useContacts().

function renderFindMy(): RenderAPI {
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
