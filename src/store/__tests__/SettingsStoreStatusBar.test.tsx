import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, act, waitFor } from '@testing-library/react-native';
import { SettingsProvider, useSettings } from '../SettingsStore';

// issue #605: the launcher must expose a Status Bar Style (light/dark/auto)
// and a "Show on Home Screen" visibility toggle, persisted under
// `@iostoandroid/settings` — currently the store has neither.

function readSettings() {
  let captured: ReturnType<typeof useSettings>['settings'] | null = null;
  function Probe() {
    captured = useSettings().settings;
    return null;
  }
  const helpers = render(
    <SettingsProvider gateFirstRender={false}>
      <Probe />
    </SettingsProvider>,
  );
  return { helpers, get: () => captured as ReturnType<typeof useSettings>['settings'] };
}

describe('SettingsStore — Status Bar (#605)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('exposes statusBarStyle defaulting to "auto"', () => {
    const { get } = readSettings();
    expect(get().statusBarStyle).toBe('auto');
  });

  it('exposes statusBarVisible defaulting to true', () => {
    const { get } = readSettings();
    expect(get().statusBarVisible).toBe(true);
  });

  it('persists a non-default statusBarStyle to AsyncStorage', async () => {
    let update: ReturnType<typeof useSettings>['update'] | null = null;
    function Probe() {
      update = useSettings().update;
      return null;
    }
    const helpers = render(
      <SettingsProvider gateFirstRender={false}>
        <Probe />
      </SettingsProvider>,
    );

    act(() => {
      update!('statusBarStyle', 'light');
    });

    await waitFor(() => {
      const raw = (AsyncStorage.setItem as jest.Mock).mock.calls.find((c) => c[0] === '@iostoandroid/settings');
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw[1]);
      expect(parsed.statusBarStyle).toBe('light');
      expect(parsed.statusBarVisible).toBe(true);
    });
    helpers.unmount();
  });

  it('hydrates a saved statusBarVisible=false from AsyncStorage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === '@iostoandroid/settings'
        ? Promise.resolve(JSON.stringify({ statusBarVisible: false, statusBarStyle: 'dark' }))
        : Promise.resolve(null),
    );

    const { get } = readSettings();
    await waitFor(() => expect(get().statusBarVisible).toBe(false));
    expect(get().statusBarStyle).toBe('dark');
  });
});
