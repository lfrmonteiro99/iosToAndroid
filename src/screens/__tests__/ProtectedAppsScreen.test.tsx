import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import launcherModule from '../../../modules/launcher-module/src';
import { ProtectedAppsScreen } from '../ProtectedAppsScreen';

// #627 — "Protected Apps": ecrã de selecção de apps que exigem biometria ao abrir.

const PROTECTED_KEY = '@iostoandroid/protected_apps';

const NATIVE_APPS = [
  { name: 'Banking App', packageName: 'com.example.banking', icon: '', isSystem: false },
  { name: 'Gallery', packageName: 'com.example.gallery', icon: '', isSystem: false },
] as never;

function setupStorage(protectedPkgs: string[] | null) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(key === PROTECTED_KEY && protectedPkgs ? JSON.stringify(protectedPkgs) : null)
  );
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
}

beforeEach(() => {
  jest.clearAllMocks();
  setupStorage(null);
  (launcherModule.getInstalledApps as jest.Mock).mockResolvedValue(NATIVE_APPS);
  (launcherModule.isDefaultLauncher as jest.Mock).mockResolvedValue(false);
});

describe('ProtectedAppsScreen (#627)', () => {
  it('lists every installed app with its protection switch off by default', async () => {
    const { getByText, getAllByRole } = render(<ProtectedAppsScreen />);

    await waitFor(() => expect(getByText('Banking App')).toBeTruthy());
    expect(getByText('Gallery')).toBeTruthy();

    const switches = getAllByRole('switch');
    expect(switches).toHaveLength(2);
    switches.forEach((s) => expect(s.props.accessibilityState.checked).toBe(false));
  });

  it('reflects a previously persisted protected-apps set', async () => {
    setupStorage(['com.example.banking']);
    const { getByText, getAllByRole } = render(<ProtectedAppsScreen />);
    await waitFor(() => expect(getByText('Banking App')).toBeTruthy());

    const switches = getAllByRole('switch');
    expect(switches[0].props.accessibilityState.checked).toBe(true);
    expect(switches[1].props.accessibilityState.checked).toBe(false);
  });

  it('toggling an app on persists it under @iostoandroid/protected_apps', async () => {
    const { getByText, getAllByRole } = render(<ProtectedAppsScreen />);
    await waitFor(() => expect(getByText('Banking App')).toBeTruthy());

    fireEvent.press(getAllByRole('switch')[0]);

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(PROTECTED_KEY, JSON.stringify(['com.example.banking']))
    );
  });

  it('toggling a protected app off removes it from persisted storage', async () => {
    setupStorage(['com.example.banking']);
    const { getAllByRole } = render(<ProtectedAppsScreen />);
    await waitFor(() => expect(getAllByRole('switch')[0].props.accessibilityState.checked).toBe(true));

    fireEvent.press(getAllByRole('switch')[0]);

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(PROTECTED_KEY, JSON.stringify([]))
    );
  });
});
