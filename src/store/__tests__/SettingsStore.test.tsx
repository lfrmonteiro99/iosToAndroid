import React from 'react';
import { Text } from 'react-native';
import { renderHook, render, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import launcherModule from '../../../modules/launcher-module/src';
import { SettingsProvider, useSettings, DEFAULT_SETTINGS } from '../SettingsStore';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SettingsProvider>{children}</SettingsProvider>
);

const wifiFixture = { enabled: true, ssid: 'TestWiFi', rssi: -50, ip: '192.168.1.100' };
const bluetoothFixture = { enabled: true, name: 'TestDevice', address: '', pairedDevices: [] };

/** Renders the raw settings as text so we can assert on what actually painted. */
function SettingsProbe() {
  const { settings, isReady } = useSettings();
  return <Text>{`ready=${isReady} wifiNetwork=${settings.wifiNetwork} bluetoothName=${settings.bluetoothName}`}</Text>;
}

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  (launcherModule.getWifiInfo as jest.Mock).mockResolvedValue(wifiFixture);
  (launcherModule.getBluetoothInfo as jest.Mock).mockResolvedValue(bluetoothFixture);
});

describe('SettingsStore', () => {
  it('provides default settings on mount and exposes syncFromDevice', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });

    await act(async () => {});

    // Core non-device settings should match defaults
    expect(result.current.settings.airplaneMode).toBe(DEFAULT_SETTINGS.airplaneMode);
    expect(result.current.settings.notificationsEnabled).toBe(DEFAULT_SETTINGS.notificationsEnabled);
    expect(result.current.settings.volume).toBe(DEFAULT_SETTINGS.volume);
    expect(result.current.isReady).toBe(true);
    // syncFromDevice should be exposed as a function
    expect(typeof result.current.syncFromDevice).toBe('function');
  });

  it('update() changes a single setting', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.update('airplaneMode', true);
    });

    expect(result.current.settings.airplaneMode).toBe(true);
    // All other defaults preserved
    expect(result.current.settings.wifiEnabled).toBe(DEFAULT_SETTINGS.wifiEnabled);
  });

  it('updateMany() changes multiple settings at once', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.updateMany({ wifiEnabled: false, bluetoothEnabled: false });
    });

    expect(result.current.settings.wifiEnabled).toBe(false);
    expect(result.current.settings.bluetoothEnabled).toBe(false);
    // Unrelated defaults preserved
    expect(result.current.settings.airplaneMode).toBe(DEFAULT_SETTINGS.airplaneMode);
  });

  it('persists to AsyncStorage on update', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    // Clear calls from hydration/initial persist
    (AsyncStorage.setItem as jest.Mock).mockClear();

    await act(async () => {
      result.current.update('lowPowerMode', true);
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@iostoandroid/settings',
      expect.stringContaining('"lowPowerMode":true'),
    );
  });

  it('reset() restores defaults', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.update('airplaneMode', true);
    });

    expect(result.current.settings.airplaneMode).toBe(true);

    await act(async () => {
      result.current.reset();
    });

    // After reset, device-independent settings revert to defaults
    expect(result.current.settings.airplaneMode).toBe(DEFAULT_SETTINGS.airplaneMode);
    expect(result.current.settings.volume).toBe(DEFAULT_SETTINGS.volume);
    expect(result.current.settings.focusMode).toBe(DEFAULT_SETTINGS.focusMode);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@iostoandroid/settings');
  });

  it('hydrates from AsyncStorage on mount', async () => {
    const saved = JSON.stringify({ ...DEFAULT_SETTINGS, airplaneMode: true, volume: 0.3 });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(saved);

    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    expect(result.current.settings.airplaneMode).toBe(true);
    expect(result.current.settings.volume).toBe(0.3);
    expect(result.current.isReady).toBe(true);
  });

  it('isReady becomes true even when AsyncStorage returns null', async () => {
    // null is returned by default mock — just confirm isReady transitions correctly
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    expect(result.current.isReady).toBe(true);
    // Device-independent settings remain at defaults when no stored data
    expect(result.current.settings.airplaneMode).toBe(DEFAULT_SETTINGS.airplaneMode);
    expect(result.current.settings.volume).toBe(DEFAULT_SETTINGS.volume);
  });
});

describe('SettingsProvider device sync gate (M10: no stale first render)', () => {
  it('renders nothing until the first device sync completes, then paints the synced SSID — never the seed value', async () => {
    // Capture the resolver up front — the Promise (and its resolve fn) must
    // exist before syncFromDevice ever calls the mock, otherwise a later call
    // to getWifiInfo() would hand back a *different* pending promise than the
    // one we hold a resolver for.
    let resolveWifi: (v: typeof wifiFixture) => void = () => {};
    const pending = new Promise<typeof wifiFixture>((resolve) => { resolveWifi = resolve; });
    (launcherModule.getWifiInfo as jest.Mock).mockReturnValueOnce(pending);

    const { queryByText, getByText } = render(
      <SettingsProvider><SettingsProbe /></SettingsProvider>,
    );

    // Gate on (default): before the bridge resolves, the provider returns null
    // for the whole subtree — the seed value ('Home') can never be painted.
    expect(queryByText(/wifiNetwork=/)).toBeNull();

    // Sanity: the bridge call is genuinely in flight and the gate is still up
    // right up to the moment it resolves.
    await waitFor(() => expect(launcherModule.getWifiInfo).toHaveBeenCalled());
    expect(queryByText(/wifiNetwork=/)).toBeNull();

    await act(async () => { resolveWifi(wifiFixture); });

    // First (and only) painted frame already carries the synced value.
    await waitFor(() => expect(getByText(/wifiNetwork=TestWiFi/)).toBeTruthy());
    expect(getByText(/bluetoothName=TestDevice/)).toBeTruthy();
  });

  it('falls back to seed values after 500ms when the device bridge hangs indefinitely', async () => {
    jest.useFakeTimers();
    try {
      (launcherModule.getWifiInfo as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));
      (launcherModule.getBluetoothInfo as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));

      const { queryByText, getByText } = render(
        <SettingsProvider><SettingsProbe /></SettingsProvider>,
      );

      // Flush the AsyncStorage.getItem() hydration + the dynamic-import hop
      // inside syncFromDevice (real microtasks, unaffected by fake timers) so
      // the bridge call is actually in flight and the fallback timer is armed.
      await waitFor(() => expect(launcherModule.getWifiInfo).toHaveBeenCalled());
      expect(queryByText(/wifiNetwork=/)).toBeNull();

      await act(async () => { jest.advanceTimersByTime(500); });

      // Bridge never resolved — the UI renders with the seed default instead of
      // hanging forever.
      expect(getByText(/wifiNetwork=Home/)).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not re-invoke the native bridge when the provider re-renders for an unrelated reason', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    await waitFor(() => expect(launcherModule.getWifiInfo).toHaveBeenCalledTimes(1));

    const syncFromDeviceRef = result.current.syncFromDevice;
    expect(launcherModule.getBluetoothInfo).toHaveBeenCalledTimes(1);

    // Trigger a re-render of the provider that has nothing to do with device sync.
    await act(async () => {
      result.current.update('airplaneMode', true);
    });

    // syncFromDevice is a stable useCallback (empty deps) — its identity does not
    // change across renders, so the sync effect (deps: [isReady, syncFromDevice])
    // never re-fires and the bridge is not called again.
    expect(result.current.syncFromDevice).toBe(syncFromDeviceRef);
    expect(launcherModule.getWifiInfo).toHaveBeenCalledTimes(1);
    expect(launcherModule.getBluetoothInfo).toHaveBeenCalledTimes(1);
  });

  it('mounting and unmounting rapidly while a sync is in flight does not throw or log errors', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let resolveWifi: (v: typeof wifiFixture) => void = () => {};
    (launcherModule.getWifiInfo as jest.Mock).mockImplementation(
      () => new Promise((resolve) => { resolveWifi = resolve; }),
    );

    for (let i = 0; i < 5; i += 1) {
      const { unmount } = render(<SettingsProvider><SettingsProbe /></SettingsProvider>);
      unmount();
    }

    await act(async () => {
      resolveWifi(wifiFixture);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
