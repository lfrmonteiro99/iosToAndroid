import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import launcherModule from '../../../modules/launcher-module/src';
import { SettingsProvider, useSettings, DEFAULT_SETTINGS } from '../SettingsStore';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SettingsProvider>{children}</SettingsProvider>
);

const wifiFixture = { enabled: true, ssid: 'TestWiFi', rssi: -50, ip: '192.168.1.100' };
const bluetoothFixture = { enabled: true, name: 'TestDevice', address: '', pairedDevices: [] };

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  (launcherModule.getWifiInfo as jest.Mock).mockResolvedValue(wifiFixture);
  (launcherModule.getBluetoothInfo as jest.Mock).mockResolvedValue(bluetoothFixture);
});

describe('Focus Filters contract (#617 pai): focusPageVisibility + focusDockOverride', () => {
  it('exposes empty focus filters by default', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    // Both filters ship empty — no mode hides pages or overrides the dock until
    // the user configures one (children #617a / #617b populate these).
    expect(result.current.settings.focusPageVisibility).toEqual({});
    expect(result.current.settings.focusDockOverride).toEqual({});
    expect(DEFAULT_SETTINGS.focusPageVisibility).toEqual({});
    expect(DEFAULT_SETTINGS.focusDockOverride).toEqual({});
  });

  it('writes a focusPageVisibility mapping via update()', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    const map = { work: ['2', '3'], sleep: ['0'] };
    await act(async () => {
      result.current.update('focusPageVisibility', map);
    });

    expect(result.current.settings.focusPageVisibility).toEqual(map);
    // Unrelated settings preserved.
    expect(result.current.settings.focusMode).toBe(DEFAULT_SETTINGS.focusMode);
  });

  it('writes a focusDockOverride mapping via update()', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    const map = { work: ['com.spotify', 'com.whatsapp'], sleep: [] };
    await act(async () => {
      result.current.update('focusDockOverride', map);
    });

    expect(result.current.settings.focusDockOverride).toEqual(map);
    expect(result.current.settings.focusMode).toBe(DEFAULT_SETTINGS.focusMode);
  });

  it('represents "no dock override for a mode" as an empty array (not a missing key)', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    // iOS "Keep Current" dock == empty override array. A child reads the key and
    // sees [] => leave the dock alone; an absent key must NOT be treated as
    // "hide everything". So the field must admit [] explicitly.
    await act(async () => {
      result.current.update('focusDockOverride', { work: [] });
    });

    expect(result.current.settings.focusDockOverride).toEqual({ work: [] });
    expect(Array.isArray(result.current.settings.focusDockOverride.work)).toBe(true);
    expect(result.current.settings.focusDockOverride.work).toHaveLength(0);
  });

  it('overwrites a previously-set mode without leaking stale mappings', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.update('focusPageVisibility', { work: ['0', '1'] });
    });
    await act(async () => {
      result.current.update('focusPageVisibility', { personal: ['2'] });
    });

    // A second write replaces the whole map (children set the entire per-mode
    // config, not a single mode entry), so 'work' must be gone.
    expect(result.current.settings.focusPageVisibility).toEqual({ personal: ['2'] });
    expect(result.current.settings.focusPageVisibility.work).toBeUndefined();
  });

  it('persists both focus filters to AsyncStorage like every other setting', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    (AsyncStorage.setItem as jest.Mock).mockClear();

    await act(async () => {
      result.current.updateMany({
        focusPageVisibility: { sleep: ['0'] },
        focusDockOverride: { sleep: ['com.calm'] },
      });
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@iostoandroid/settings',
      expect.stringContaining('"focusPageVisibility":{"sleep":["0"]}'),
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@iostoandroid/settings',
      expect.stringContaining('"focusDockOverride":{"sleep":["com.calm"]}'),
    );
  });

  it('hydrates persisted focus filters from AsyncStorage on mount', async () => {
    const saved = JSON.stringify({
      ...DEFAULT_SETTINGS,
      focusPageVisibility: { work: ['1', '4'] },
      focusDockOverride: { work: ['com.slack'] },
    });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(saved);

    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    expect(result.current.settings.focusPageVisibility).toEqual({ work: ['1', '4'] });
    expect(result.current.settings.focusDockOverride).toEqual({ work: ['com.slack'] });
  });

  it('survives a round-trip through reset() back to the empty default', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.update('focusPageVisibility', { doNotDisturb: ['0'] });
    });
    expect(result.current.settings.focusPageVisibility).toEqual({ doNotDisturb: ['0'] });

    await act(async () => {
      result.current.reset();
    });

    expect(result.current.settings.focusPageVisibility).toEqual({});
    expect(result.current.settings.focusDockOverride).toEqual({});
  });
});
