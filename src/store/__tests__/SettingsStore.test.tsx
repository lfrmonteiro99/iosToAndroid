import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SettingsProvider, useSettings, DEFAULT_SETTINGS } from '../SettingsStore';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SettingsProvider>{children}</SettingsProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
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
