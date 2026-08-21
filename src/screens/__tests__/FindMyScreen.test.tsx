import React from 'react';
import { waitFor, fireEvent } from '@testing-library/react-native';
import { render } from '../../test-utils';
import { FindMyScreen } from '../FindMyScreen';

// AllProviders (in test-utils) already wraps with ThemeProvider,
// DeviceProvider and LocationProvider, so we render FindMyScreen directly.
// The permission state defaults to 'granted' in jest.setup.js (mocked
// getForegroundPermissionsAsync returns status 'granted'); the denied /
// undetermined paths are exercised by overriding the mock per-test.

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
