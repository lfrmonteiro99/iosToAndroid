import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import launcherModule from '../../../modules/launcher-module/src';
import { SpotlightSearchScreen } from '../SpotlightSearchScreen';
import { AppLibraryContent } from '../AppLibraryScreen';
import type { AppNavigationProp } from '../../navigation/types';

// #610 — Siri & Search: os toggles searchShowInSearch / searchShowInLibrary /
// searchShowSuggestions controlam a visibilidade das apps na procura e na App
// Library. As apps continuam instaladas e lançáveis.
const NATIVE_APPS = [
  { name: 'Facebook', packageName: 'com.facebook', icon: '', isSystem: false, category: 'social' },
  { name: 'Spotify', packageName: 'com.spotify', icon: '', isSystem: false, category: 'undefined' },
] as never;

const SETTINGS_KEY = '@iostoandroid/settings';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as unknown as AppNavigationProp;

function mockStoredSettings(partial: Record<string, unknown>) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(key === SETTINGS_KEY ? JSON.stringify(partial) : null),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  (launcherModule.getInstalledApps as jest.Mock).mockResolvedValue(NATIVE_APPS);
  (launcherModule.isDefaultLauncher as jest.Mock).mockResolvedValue(false);
});

describe('Siri & Search — visibilidade na procura (#610)', () => {
  it('por omissão (searchShowInSearch=true) a app aparece na secção Apps do Spotlight', async () => {
    const { getByPlaceholderText, getByText, queryByText } = render(
      <SpotlightSearchScreen navigation={mockNavigation} />,
    );
    await waitFor(() => expect(queryByText('Search')).toBeTruthy());
    fireEvent.changeText(getByPlaceholderText('Search'), 'Facebook');
    await waitFor(() => expect(getByText('Facebook')).toBeTruthy());
    expect(getByText('Apps')).toBeTruthy();
  });

  it('searchShowInSearch=false remove a secção Apps e a app dos resultados', async () => {
    mockStoredSettings({ searchShowInSearch: false });
    const { getByPlaceholderText, queryByText } = render(
      <SpotlightSearchScreen navigation={mockNavigation} />,
    );
    await waitFor(() => expect(queryByText('Search')).toBeTruthy());
    fireEvent.changeText(getByPlaceholderText('Search'), 'Facebook');
    await waitFor(() => expect(queryByText('Apps')).toBeNull());
    expect(queryByText('Facebook')).toBeNull();
  });

  it('searchShowInSearch=false não afecta as outras secções (Settings continua a aparecer)', async () => {
    mockStoredSettings({ searchShowInSearch: false });
    const { getByPlaceholderText, queryByText, getByText } = render(
      <SpotlightSearchScreen navigation={mockNavigation} />,
    );
    await waitFor(() => expect(queryByText('Search')).toBeTruthy());
    fireEvent.changeText(getByPlaceholderText('Search'), 'Bluetooth');
    await waitFor(() => expect(getByText('Settings')).toBeTruthy());
    expect(queryByText('Apps')).toBeNull();
  });

  it('query vazia não mostra secções, independentemente do toggle', async () => {
    mockStoredSettings({ searchShowInSearch: false });
    const { getByPlaceholderText, queryByText } = render(
      <SpotlightSearchScreen navigation={mockNavigation} />,
    );
    await waitFor(() => expect(queryByText('Search')).toBeTruthy());
    fireEvent.changeText(getByPlaceholderText('Search'), '   ');
    expect(queryByText('Apps')).toBeNull();
    expect(queryByText('Web')).toBeNull();
  });
});

describe('Siri & Search — visibilidade na App Library (#610)', () => {
  it('por omissão a App Library mostra as apps e o strip Suggestions', async () => {
    const { getAllByText, getByText } = render(<AppLibraryContent />);
    await waitFor(() => expect(getAllByText('Facebook').length).toBeGreaterThan(0));
    expect(getByText('Suggestions')).toBeTruthy();
    expect(getByText('Categories')).toBeTruthy();
  });

  it('searchShowInLibrary=false esconde as apps da App Library', async () => {
    mockStoredSettings({ searchShowInLibrary: false });
    const { queryAllByText, queryByText } = render(<AppLibraryContent />);
    await waitFor(() => expect(queryByText('Categories')).toBeTruthy());
    expect(queryAllByText('Facebook')).toHaveLength(0);
    expect(queryAllByText('Spotify')).toHaveLength(0);
    expect(queryByText('Recently Added')).toBeNull();
    expect(queryByText('Suggestions')).toBeNull();
  });

  it('searchShowInLibrary=false também esvazia a procura interna da App Library', async () => {
    mockStoredSettings({ searchShowInLibrary: false });
    const { getByPlaceholderText, queryAllByText, queryByText } = render(<AppLibraryContent />);
    await waitFor(() => expect(queryByText('Categories')).toBeTruthy());
    fireEvent.changeText(getByPlaceholderText('App Library'), 'Face');
    await waitFor(() => expect(queryAllByText('Facebook')).toHaveLength(0));
  });

  it('searchShowSuggestions=false esconde só o strip Suggestions — as apps e as categorias ficam', async () => {
    mockStoredSettings({ searchShowSuggestions: false });
    const { getAllByText, queryByText, getByText } = render(<AppLibraryContent />);
    await waitFor(() => expect(getAllByText('Facebook').length).toBeGreaterThan(0));
    expect(queryByText('Suggestions')).toBeNull();
    expect(getByText('Categories')).toBeTruthy();
    expect(getByText('Recently Added')).toBeTruthy();
  });
});
