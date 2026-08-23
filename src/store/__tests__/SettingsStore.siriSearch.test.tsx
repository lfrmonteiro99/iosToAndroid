import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import launcherModule from '../../../modules/launcher-module/src';
import { SettingsProvider, useSettings, DEFAULT_SETTINGS } from '../SettingsStore';

// #610 — Siri & Search: os três toggles têm default true, persistem no
// AsyncStorage e sobrevivem a um arranque com valores gravados.
const STORAGE_KEY = '@iostoandroid/settings';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SettingsProvider>{children}</SettingsProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  (launcherModule.getWifiInfo as jest.Mock).mockResolvedValue({ enabled: true, ssid: '', rssi: 0, ip: '' });
  (launcherModule.getBluetoothInfo as jest.Mock).mockResolvedValue({ enabled: true, name: '', address: '', pairedDevices: [] });
});

describe('SettingsStore — Siri & Search (#610)', () => {
  it('defaults the three toggles to true', () => {
    expect(DEFAULT_SETTINGS.searchShowSuggestions).toBe(true);
    expect(DEFAULT_SETTINGS.searchShowInSearch).toBe(true);
    expect(DEFAULT_SETTINGS.searchShowInLibrary).toBe(true);
  });

  it('a first read that returns null keeps the defaults on', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});
    expect(result.current.settings.searchShowInSearch).toBe(true);
    expect(result.current.settings.searchShowInLibrary).toBe(true);
    expect(result.current.settings.searchShowSuggestions).toBe(true);
  });

  it('update() persists the toggle to AsyncStorage', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.update('searchShowInLibrary', false);
    });

    expect(result.current.settings.searchShowInLibrary).toBe(false);
    const persisted = (AsyncStorage.setItem as jest.Mock).mock.calls
      .filter(([key]) => key === STORAGE_KEY)
      .map(([, value]) => JSON.parse(value as string));
    expect(persisted[persisted.length - 1].searchShowInLibrary).toBe(false);
  });

  it('reloads stored false values on a fresh mount, leaving the others true', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === STORAGE_KEY ? JSON.stringify({ searchShowInSearch: false }) : null),
    );
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    expect(result.current.settings.searchShowInSearch).toBe(false);
    // Chaves ausentes no armazenamento caem no default, não em undefined.
    expect(result.current.settings.searchShowInLibrary).toBe(true);
    expect(result.current.settings.searchShowSuggestions).toBe(true);
  });

  it('reset() restores the three toggles to true', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === STORAGE_KEY
        ? JSON.stringify({ searchShowInSearch: false, searchShowInLibrary: false, searchShowSuggestions: false })
        : null),
    );
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});
    expect(result.current.settings.searchShowInSearch).toBe(false);

    await act(async () => { result.current.reset(); });

    expect(result.current.settings.searchShowInSearch).toBe(true);
    expect(result.current.settings.searchShowInLibrary).toBe(true);
    expect(result.current.settings.searchShowSuggestions).toBe(true);
  });

  it('ignores a corrupt stored payload and keeps the defaults', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === STORAGE_KEY ? 'not json {{{' : null),
    );
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});
    expect(result.current.settings.searchShowInSearch).toBe(true);
  });
});
