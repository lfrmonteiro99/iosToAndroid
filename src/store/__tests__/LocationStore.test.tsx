import React from 'react';
import { Text } from 'react-native';
import { render, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocationProvider, useLocation } from '../LocationStore';

// expo-location is mocked globally in jest.setup.js with fixed coords and a
// granted permission default. Individual tests override via jest.spyOn when a
// different status is needed.

const HISTORY_KEY = '@iostoandroid/findmy_location_history';
const LOCATION_KEY = '@iostoandroid/findmy_location';

function Harness({ children }: { children: React.ReactNode }) {
  return <LocationProvider>{children}</LocationProvider>;
}

// A probe that renders the raw store value into testable text.
function Probe() {
  const { currentLocation, history, permissionStatus, isReady, requestPermission, refreshLocation } =
    useLocation();
  return (
    <React.Fragment>
      <Text testID="ready">{String(isReady)}</Text>
      <Text testID="perm">{permissionStatus}</Text>
      <Text testID="current">{currentLocation ? `${currentLocation.latitude},${currentLocation.longitude}` : 'none'}</Text>
      <Text testID="historyLen">{String(history.length)}</Text>
      <Text testID="actions" onPress={async () => { await requestPermission(); await refreshLocation(); }}>actions</Text>
    </React.Fragment>
  );
}

describe('LocationStore', () => {
  beforeEach(async () => {
    await AsyncStorage.removeItem(LOCATION_KEY);
    await AsyncStorage.removeItem(HISTORY_KEY);
    jest.clearAllMocks();
  });

  it('throws when used outside LocationProvider', () => {
    // Suppress the expected React error boundary noise.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useLocation must be used within LocationProvider');
    spy.mockRestore();
  });

  it('is ready after hydration and reports the mocked granted permission', async () => {
    const { getByTestId } = render(
      <Harness>
        <Probe />
      </Harness>,
    );
    await waitFor(() => expect(getByTestId('ready').props.children).toBe('true'));
    expect(getByTestId('perm').props.children).toBe('granted');
  });

  it('persists currentLocation and appends to a capped (50-entry) history on refresh', async () => {
    const { getByTestId } = render(
      <Harness>
        <Probe />
      </Harness>,
    );
    await waitFor(() => expect(getByTestId('ready').props.children).toBe('true'));

    // Drive 60 refreshes; history must cap at 50 and the latest point wins.
    for (let i = 0; i < 60; i++) {
      await act(async () => {
        await getByTestId('actions').props.onPress();
      });
    }

    await waitFor(() => expect(getByTestId('historyLen').props.children).toBe('50'));
    // The most recent coordinate from the mock is 37.7749,-122.4194.
    expect(getByTestId('current').props.children).toBe('37.7749,-122.4194');

    // Persistence is verified by spying on the AsyncStorage.setItem call with
    // the capped history array (the in-memory mock does not retain writes).
    const setItem = AsyncStorage.setItem as jest.Mock;
    const historyCalls = setItem.mock.calls.filter((c) => c[0] === HISTORY_KEY);
    expect(historyCalls.length).toBeGreaterThan(0);
    const lastHistoryWrite = historyCalls[historyCalls.length - 1][1] as string;
    const storedHistory = JSON.parse(lastHistoryWrite) as unknown[];
    expect(storedHistory.length).toBe(50);

    const locationCalls = setItem.mock.calls.filter((c) => c[0] === LOCATION_KEY);
    expect(locationCalls.length).toBeGreaterThan(0);
    const storedCurrent = JSON.parse(locationCalls[locationCalls.length - 1][1] as string) as {
      latitude: number;
      longitude: number;
    } | null;
    expect(storedCurrent).not.toBeNull();
    expect(storedCurrent?.latitude).toBe(37.7749);
  });

  it('cap is exactly 50 even at the boundary plus one (51 -> 50, not 51)', async () => {
    const { getByTestId } = render(
      <Harness>
        <Probe />
      </Harness>,
    );
    await waitFor(() => expect(getByTestId('ready').props.children).toBe('true'));

    for (let i = 0; i < 51; i++) {
      await act(async () => {
        await getByTestId('actions').props.onPress();
      });
    }
    await waitFor(() => expect(getByTestId('historyLen').props.children).toBe('50'));
  });

  it('maps a denied foreground permission to "denied" and requestPermission returns false', async () => {
    const loc = jest.requireMock('expo-location');
    jest.spyOn(loc, 'requestForegroundPermissionsAsync').mockResolvedValue({ status: 'denied' });
    jest.spyOn(loc, 'getForegroundPermissionsAsync').mockResolvedValue({ status: 'denied' });

    let requestResult = true;
    function DeniedProbe() {
      const { requestPermission, permissionStatus } = useLocation();
      return (
        <Text
          testID="denied"
          onPress={async () => {
            requestResult = await requestPermission();
          }}
        >
          {permissionStatus}
        </Text>
      );
    }

    const { getByTestId } = render(
      <Harness>
        <DeniedProbe />
      </Harness>,
    );
    await waitFor(() => expect(getByTestId('denied').props.children).toBe('denied'));
    await act(async () => {
      await getByTestId('denied').props.onPress();
    });
    expect(requestResult).toBe(false);
  });

  it('does not append to history when permission is denied (no coordinate fetched)', async () => {
    const loc = jest.requireMock('expo-location');
    jest.spyOn(loc, 'getForegroundPermissionsAsync').mockResolvedValue({ status: 'denied' });

    const { getByTestId } = render(
      <Harness>
        <Probe />
      </Harness>,
    );
    await waitFor(() => expect(getByTestId('ready').props.children).toBe('true'));

    await act(async () => {
      // refreshLocation should early-return without touching history.
      getByTestId('actions').props.onPress();
    });
    await waitFor(() => expect(getByTestId('historyLen').props.children).toBe('0'));
    expect(getByTestId('current').props.children).toBe('none');
  });
});
