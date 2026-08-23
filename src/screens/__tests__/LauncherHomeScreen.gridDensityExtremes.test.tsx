import React from 'react';
import { computeLauncherGridGeometry } from '../../utils/launcherGridGeometry';

// O @testing-library/react-native regista afterEach/beforeAll a nível de
// módulo (auto-cleanup). Como este ficheiro re-requer o test-utils dentro de
// cada teste (registry novo por largura), esses hooks seriam registados
// dentro de um teste — o que o jest-circus rejeita. Com
// RNTL_SKIP_AUTO_CLEANUP o módulo não regista hooks; o registry é deitado
// fora pelo jest.resetModules() no afterEach, por isso não há árvores a
// vazar.
process.env.RNTL_SKIP_AUTO_CLEANUP = 'true';

// issue #503 — aceitação: `iconSizeScale` nos extremos (0.8 e 1.2) não corta
// colunas nem sobrepõe ícones, a 360 e 480dp. Este ficheiro cobre a
// combinação que a primeira versão não cobria: labels escondidos
// (showIconLabels=false) × escala nos extremos × larguras 360/480dp, com o
// invariante VERTICAL — a altura da célula tem de ser >= o lado do ícone,
// senão o ícone transborda para a linha seguinte da grelha. (O invariante
// horizontal, iconSize <= cellWidth, já estava coberto nos testes da
// geometria pura.)
//
// SCREEN_WIDTH é uma constante de módulo de LauncherHomeScreen lida no
// import. Para renderizar a componente REAL a 360/480dp é preciso carregar o
// módulo depois de mapear Dimensions.get — daí jest.resetModules() + require()
// por largura, o mesmo padrão de launcherGridGeometry.test.ts (que só lia
// exports; aqui renderiza-se a árvore completa).

function renderScreenAt(width: number, settings: Record<string, unknown>) {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Dimensions } = require('react-native') as typeof import('react-native');
  jest.spyOn(Dimensions, 'get').mockReturnValue({ width, height: 800, scale: 2, fontScale: 1 });

  // O AsyncStorage é um mock do jest.setup — cada registry novo ganha
  // instâncias novas, por isso o seed tem de ser aplicado à instância fresca.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FreshAsyncStorage = require('@react-native-async-storage/async-storage').default;
  FreshAsyncStorage.getItem.mockImplementation((key: string) =>
    key === '@iostoandroid/settings'
      ? Promise.resolve(JSON.stringify(settings))
      : Promise.resolve(null),
  );

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const utils = require('../../test-utils') as typeof import('../../test-utils');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { LauncherHomeScreen } = require('../LauncherHomeScreen') as {
    LauncherHomeScreen: React.ComponentType;
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AppsStore = require('../../store/AppsStore');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FoldersStore = require('../../store/FoldersStore');
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps: [],
    homeApps: [],
    dockApps: [],
    nonDockApps: [],
    recentPackages: [],
    recentApps: [],
    isLoading: false,
    refreshApps: jest.fn(() => Promise.resolve()),
    launchApp: jest.fn(() => Promise.resolve(true)),
    addToHome: jest.fn(),
    removeFromHome: jest.fn(),
    addToDock: jest.fn(),
    removeFromDock: jest.fn(),
    removeFromRecents: jest.fn(),
    clearRecents: jest.fn(),
    isDefaultLauncher: true,
    openLauncherSettings: jest.fn(() => Promise.resolve()),
    iconCacheSizeBytes: 0,
    isRebuildingIconCache: false,
    iconCacheRebuildProgress: null,
    rebuildIconCache: jest.fn(() => Promise.resolve()),
  } as ReturnType<typeof AppsStore.useApps>);
  jest.spyOn(FoldersStore, 'useFolders').mockReturnValue({
    folders: [],
    createFolder: jest.fn(),
    renameFolder: jest.fn(),
    addToFolder: jest.fn(),
    removeFromFolder: jest.fn(),
    deleteFolder: jest.fn(),
    getFolderForApp: jest.fn(() => undefined),
    isReady: true,
  } as ReturnType<typeof FoldersStore.useFolders>);

  return { root: utils.render(<LauncherHomeScreen />), waitFor: utils.waitFor };
}

function wrapperHeightOf(root: ReturnType<typeof import('../../test-utils').render>): number {
  const el = root.getByLabelText('Open Phone');
  const style = el.props.style;
  const flat = (Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean) as Record<string, number>[];
  return flat.reduce((acc, s) => (s.height != null ? s.height : acc), 0);
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.resetModules();
});

describe('LauncherHomeScreen: extremos da escala do ícone a 360/480dp, sem labels (#503)', () => {
  it.each([
    [360, 1.2],
    [360, 0.8],
    [480, 1.2],
    [480, 0.8],
  ])(
    'a %idp com scale %p e labels escondidos, a célula nunca é mais baixa que o ícone',
    async (width, scale) => {
      const { root, waitFor } = renderScreenAt(width as number, {
        showIconLabels: false,
        iconSizeScale: scale,
        gridColumns: 4,
        gridRows: 6,
      });

      await waitFor(() => expect(root.getByLabelText('Open Phone')).toBeTruthy(), { timeout: 3000 });
      const height = wrapperHeightOf(root);
      const expected = computeLauncherGridGeometry(width as number, 4, scale as number);

      // Invariante vertical: sem sobreposição entre linhas.
      expect(height).toBeGreaterThanOrEqual(expected.iconSize);
      // E a célula é exactamente paddingTop (5) + ícone, sem label.
      expect(height).toBe(5 + expected.iconSize);
    },
  );
});
