import React from 'react';
import { render, waitFor } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import launcherModule from '../../../modules/launcher-module/src';
import { AppLibraryContent } from '../AppLibraryScreen';

// #699 — a App Library é a última página do pager da home (montada inline em
// LauncherHomeScreen). Se uma app instalada tiver o `name` ausente/undefined
// (payload nativo corrompido ou índice em cache antigo), o categorizeApp
// rebentava em `app.name.toLowerCase()` e o throw derrubava o launcher inteiro
// — aparecia o ecrã inicial do Android em vez da App Library.
//
// Este teste monta a AppLibraryContent com uma app SEM name e confirma que a
// grelha renderiza (header "Categories" presente) em vez de crashar.
const REAL_APPS = [
  { name: 'Facebook', packageName: 'com.facebook', icon: '', isSystem: false, category: 'social' },
] as never;

const MALFORMED_APPS = [
  { name: 'Facebook', packageName: 'com.facebook', icon: '', isSystem: false, category: 'social' },
  { name: undefined, packageName: 'com.corrupted.entry', icon: '', isSystem: false, category: 'undefined' },
] as never;

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  (launcherModule.getInstalledApps as jest.Mock).mockResolvedValue(REAL_APPS);
  (launcherModule.isDefaultLauncher as jest.Mock).mockResolvedValue(false);
});

describe('AppLibraryContent — app sem name não derruba a App Library (#699)', () => {
  it('renderiza a grelha (header "Categories") quando uma app instalada não tem name', async () => {
    (launcherModule.getInstalledApps as jest.Mock).mockResolvedValue(MALFORMED_APPS);
    const utils = render(<AppLibraryContent />);
    // O header "Categories" só aparece se buildCategorySections correu sem
    // rebentar — ou seja, se o categorizeApp aguentou a app sem name.
    await waitFor(() => expect(utils.getByText('Categories')).toBeTruthy());
    // A app com name válido continua na grelha.
    expect(utils.getAllByText('Facebook').length).toBeGreaterThan(0);
  });

  it('o inverso: com todas as apps bem-formadas a grelha também renderiza (guarda de regressão)', async () => {
    const utils = render(<AppLibraryContent />);
    await waitFor(() => expect(utils.getByText('Categories')).toBeTruthy());
    expect(utils.getAllByText('Facebook').length).toBeGreaterThan(0);
  });
});
