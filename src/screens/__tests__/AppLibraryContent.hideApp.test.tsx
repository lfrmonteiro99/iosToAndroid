import React from 'react';
import { render, waitFor, fireEvent } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import launcherModule from '../../../modules/launcher-module/src';
import { AppLibraryContent } from '../AppLibraryScreen';

// #606 — esconder uma app: sai das categorias e dos strips (Recently Added /
// Suggestions), mas continua alcançável pela procura.
const NATIVE_APPS = [
  { name: 'Facebook', packageName: 'com.facebook', icon: '', isSystem: false, category: 'social' },
  { name: 'Spotify', packageName: 'com.spotify', icon: '', isSystem: false, category: 'undefined' },
] as never;

const HIDDEN_KEY = '@iostoandroid/hidden_apps';

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  (launcherModule.getInstalledApps as jest.Mock).mockResolvedValue(NATIVE_APPS);
  (launcherModule.isDefaultLauncher as jest.Mock).mockResolvedValue(false);
});

async function renderLibrary() {
  const utils = render(<AppLibraryContent />);
  await waitFor(() => expect(utils.getAllByText('Facebook').length).toBeGreaterThan(0));
  return utils;
}

describe('AppLibraryContent — hide app (#606)', () => {
  it('long-press num ícone da categoria oferece "Hide App" e esconder remove a app das listas', async () => {
    const { getAllByLabelText, getByText, queryAllByText } = await renderLibrary();

    fireEvent.press(getAllByLabelText(/Social category/)[0]);
    const pressables = getAllByLabelText('Open Facebook, App Library') as never[];
    fireEvent(pressables[pressables.length - 1], 'longPress' as never);

    await waitFor(() => expect(getByText('Hide App')).toBeTruthy());
    fireEvent.press(getByText('Hide App'));

    // Sai das categorias e dos strips.
    await waitFor(() => expect(queryAllByText('Facebook')).toHaveLength(0));
    // E persiste.
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      HIDDEN_KEY,
      JSON.stringify(['com.facebook']),
    );
  });

  it('uma app escondida continua a aparecer (e a ser lançável) na procura', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === HIDDEN_KEY ? JSON.stringify(['com.facebook']) : null),
    );
    const { getByPlaceholderText, getAllByText, queryAllByText, getByLabelText } = render(<AppLibraryContent />);
    await waitFor(() => expect(getAllByText('Spotify').length).toBeGreaterThan(0));

    // Ausente das listas browsable.
    expect(queryAllByText('Facebook')).toHaveLength(0);

    fireEvent.changeText(getByPlaceholderText('Search'), 'face');
    await waitFor(() => expect(getAllByText('Facebook').length).toBeGreaterThan(0));

    // A linha da procura é um pressable de lançamento — a app escondida continua
    // acessível por aqui (é o que distingue "hide" de "uninstall").
    expect(getByLabelText('Open Facebook, App Library')).toBeTruthy();
  });

  it('o inverso do fix: sem apps escondidas, todas continuam nas categorias', async () => {
    const { getAllByText } = await renderLibrary();
    expect(getAllByText('Facebook').length).toBeGreaterThan(0);
    expect(getAllByText('Spotify').length).toBeGreaterThan(0);
  });

  it('cancelar o sheet de long-press não esconde nada', async () => {
    const { getAllByLabelText, getByText, getAllByText } = await renderLibrary();

    fireEvent.press(getAllByLabelText(/Social category/)[0]);
    const pressables = getAllByLabelText('Open Facebook, App Library') as never[];
    fireEvent(pressables[pressables.length - 1], 'longPress' as never);
    await waitFor(() => expect(getByText('Hide App')).toBeTruthy());

    fireEvent.press(getByText('Cancelar'));

    await waitFor(() => expect(getAllByText('Facebook').length).toBeGreaterThan(0));
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(HIDDEN_KEY, expect.anything());
  });
});
