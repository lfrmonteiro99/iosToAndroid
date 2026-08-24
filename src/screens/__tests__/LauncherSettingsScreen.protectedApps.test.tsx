import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import launcherModule from '../../../modules/launcher-module/src';
import { LauncherSettingsScreen } from '../LauncherSettingsScreen';

// #627 — «Protected Apps»: entrada na secção «App Lock» das Launcher Settings
// que navega para o ecrã de selecção.

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), canGoBack: jest.fn(() => false) }),
  useRoute: () => ({ params: {} }),
}));

const PROTECTED_KEY = '@iostoandroid/protected_apps';

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
  (launcherModule.getInstalledApps as jest.Mock).mockResolvedValue([]);
  (launcherModule.isDefaultLauncher as jest.Mock).mockResolvedValue(false);
});

describe('LauncherSettingsScreen — App Lock / Protected Apps (#627)', () => {
  it('shows the Protected Apps row with "None" when nothing is protected', async () => {
    const { getByText } = render(<LauncherSettingsScreen />);
    await waitFor(() => expect(getByText('Protected Apps')).toBeTruthy());
    expect(getByText('None')).toBeTruthy();
  });

  it('shows the protected count once apps are protected', async () => {
    setupStorage(['com.example.banking', 'com.example.gallery']);
    const { getByText } = render(<LauncherSettingsScreen />);
    await waitFor(() => expect(getByText('2 protected')).toBeTruthy());
  });

  it('tapping the row navigates to ProtectedApps', async () => {
    const { getByText } = render(<LauncherSettingsScreen />);
    await waitFor(() => expect(getByText('Protected Apps')).toBeTruthy());

    fireEvent.press(getByText('Protected Apps'));

    expect(mockNavigate).toHaveBeenCalledWith('ProtectedApps');
  });
});
