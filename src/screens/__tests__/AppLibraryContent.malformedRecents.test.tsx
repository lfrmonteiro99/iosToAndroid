import React from 'react';
import { render, waitFor } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import launcherModule from '../../../modules/launcher-module/src';
import { AppLibraryContent } from '../AppLibraryScreen';

// #689 — a App Library é a última página do pager da home (montada inline em
// LauncherHomeScreen). As strips "Recently Added"/"Suggestions" ordenam
// `recentApps` com `b.launchedAt - a.launchedAt` e resolvem
// `r.packageName`. `recentApps` vem de um blob do AsyncStorage
// (@iostoandroid/recent_apps) que o AppsStore aceitava desde que fosse um
// array — sem validar as ENTRADAS. Um blob corrompido (entrada `null`, string,
// objecto sem packageName/launchedAt) fazia o render rebentar com TypeError e o
// throw derrubava o launcher inteiro: em vez da App Library aparecia o ecrã
// inicial do Android. Como o blob é persistido, o crash repetia-se em cada
// arranque.
const RECENTS_KEY = '@iostoandroid/recent_apps';

const APPS = [
  { name: 'Facebook', packageName: 'com.facebook', icon: '', isSystem: false, category: 'social' },
  { name: 'Spotify', packageName: 'com.spotify', icon: '', isSystem: false, category: 'audio' },
] as never;

function mockStorage(recents: unknown) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
    key === RECENTS_KEY ? JSON.stringify(recents) : null,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  (launcherModule.getInstalledApps as jest.Mock).mockResolvedValue(APPS);
  (launcherModule.isDefaultLauncher as jest.Mock).mockResolvedValue(false);
});

describe('AppLibraryContent — blob de recentes corrompido não derruba a App Library (#689)', () => {
  it.each([
    ['uma entrada null', [null, { packageName: 'com.facebook', launchedAt: 2 }]],
    ['uma entrada string', ['com.facebook', { packageName: 'com.spotify', launchedAt: 2 }]],
    ['uma entrada sem launchedAt', [{ packageName: 'com.facebook' }]],
    ['launchedAt não numérico', [{ packageName: 'com.facebook', launchedAt: 'ontem' }]],
    ['packageName não string', [{ packageName: 42, launchedAt: 1 }]],
    ['uma entrada aninhada em array', [[{ packageName: 'com.facebook', launchedAt: 1 }]]],
  ])('renderiza a grelha com %s no blob de recentes', async (_label, recents) => {
    mockStorage(recents);
    const utils = render(<AppLibraryContent />);
    await waitFor(() => expect(utils.getByText('Categories')).toBeTruthy());
    expect(utils.getAllByText('Facebook').length).toBeGreaterThan(0);
  });

  it('blob de recentes vazio: a grelha renderiza e as strips caem no fallback alfabético', async () => {
    mockStorage([]);
    const utils = render(<AppLibraryContent />);
    await waitFor(() => expect(utils.getByText('Categories')).toBeTruthy());
    expect(utils.getAllByText('Facebook').length).toBeGreaterThan(0);
  });

  it('o inverso do fix: entradas VÁLIDAS continuam a alimentar "Recently Added"', async () => {
    mockStorage([
      { packageName: 'com.spotify', launchedAt: 100 },
      { packageName: 'com.facebook', launchedAt: 50 },
    ]);
    const utils = render(<AppLibraryContent />);
    await waitFor(() => expect(utils.getByText('Recently Added')).toBeTruthy());
    // Spotify (o mais recente) aparece na strip, logo há mais do que uma
    // ocorrência do seu nome (strip + categoria).
    await waitFor(() => expect(utils.getAllByText('Spotify').length).toBeGreaterThan(1));
  });

  it('entradas válidas misturadas com lixo: as válidas sobrevivem à filtragem', async () => {
    mockStorage([null, { packageName: 'com.spotify', launchedAt: 100 }, 'lixo']);
    const utils = render(<AppLibraryContent />);
    await waitFor(() => expect(utils.getByText('Recently Added')).toBeTruthy());
    await waitFor(() => expect(utils.getAllByText('Spotify').length).toBeGreaterThan(1));
  });
});
