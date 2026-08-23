import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import launcherModule from '../../../modules/launcher-module/src';
import { LauncherSettingsScreen } from '../LauncherSettingsScreen';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

const HIDDEN_KEY = '@iostoandroid/hidden_apps';

const NATIVE_APPS = [
  { name: 'Facebook', packageName: 'com.facebook', icon: '', isSystem: false },
  { name: 'Spotify', packageName: 'com.spotify', icon: '', isSystem: false },
] as never;

function setupStorage(hidden: string[] | null) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
    key === HIDDEN_KEY && hidden ? JSON.stringify(hidden) : null,
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

describe('LauncherSettingsScreen — Hidden Apps (#606)', () => {
  it('lista as apps escondidas pelo nome e mostra o botão de as revelar', async () => {
    setupStorage(['com.facebook']);
    const { getByText, getAllByText } = render(<LauncherSettingsScreen />);

    await waitFor(() => expect(getByText('HIDDEN APPS')).toBeTruthy());
    expect(getAllByText('Facebook').length).toBeGreaterThan(0);
    expect(getByText('Unhide All Apps')).toBeTruthy();
  });

  it('tocar numa app escondida revela-a: sai da lista e a persistência é actualizada', async () => {
    setupStorage(['com.facebook']);
    const { queryByText, getAllByText } = render(<LauncherSettingsScreen />);
    await waitFor(() => expect(getAllByText('Facebook').length).toBeGreaterThan(0));

    fireEvent.press(getAllByText('Facebook')[0]);

    await waitFor(() => expect(queryByText('HIDDEN APPS')).toBeNull());
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(HIDDEN_KEY, JSON.stringify([]));
  });

  it('"Unhide All Apps" limpa o conjunto inteiro', async () => {
    setupStorage(['com.facebook', 'com.spotify']);
    const { getByText, queryByText } = render(<LauncherSettingsScreen />);
    await waitFor(() => expect(getByText('HIDDEN APPS')).toBeTruthy());

    fireEvent.press(getByText('Unhide All Apps'));

    await waitFor(() => expect(queryByText('HIDDEN APPS')).toBeNull());
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(HIDDEN_KEY, JSON.stringify([]));
  });

  it('sem apps escondidas a secção não é renderizada (o inverso do fix)', async () => {
    setupStorage(null);
    const { queryByText, getByText } = render(<LauncherSettingsScreen />);
    // O ecrã montou (uma secção estável existe)…
    await waitFor(() => expect(getByText('APPEARANCE')).toBeTruthy());
    // …e a secção Hidden Apps está ausente.
    expect(queryByText('HIDDEN APPS')).toBeNull();
    expect(queryByText('Unhide All Apps')).toBeNull();
  });

  it('um pacote escondido que já não está instalado aparece pelo packageName e ainda é revelável', async () => {
    setupStorage(['com.gone.forever']);
    const { getByText } = render(<LauncherSettingsScreen />);

    await waitFor(() => expect(getByText('com.gone.forever')).toBeTruthy());
    fireEvent.press(getByText('com.gone.forever'));

    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledWith(HIDDEN_KEY, JSON.stringify([])));
  });
});
