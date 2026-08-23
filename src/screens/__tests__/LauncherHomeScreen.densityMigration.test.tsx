import React from 'react';
import { View, ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, waitFor, within, fireEvent } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import * as FoldersStore from '../../store/FoldersStore';
import { useSettings } from '../../store/SettingsStore';
import { LauncherHomeScreen } from '../LauncherHomeScreen';

// issue #503 — Ponto 2: mudar a densidade da grelha (colunas/linhas) re-pagina
// TUDO sem perder a ordem das apps e sem perder as pastas. Antes deste issue a
// paginação usava uma constante de módulo (4x6 = 24 apps/página) independente
// das definições, por isso mudar colunas/linhas não re-paginava — e o issue
// exigia uma "regra de migração explícita". A regra implementada é: a lista
// `gridItems` é sempre reconstruída por ordem estável (apps + folders) e a
// paginação faz slice dessa lista plana no novo tamanho de página
// (`appsPerPage = cols x gridRows`); não há posições por-página guardadas, por
// isso re-embalar é automático e a ordem linear é preservada. Este teste trava
// esse comportamento: ida 4x6 -> 5x5, volta 5x5 -> 4x6, e as pastas têm de
// aparecer em ambas as densidades.
//
// Nota: o LauncherHomeScreen também injeta as 14 BUILT_IN_APPS virtuais na mesma
// `gridItems`, por isso o total renderizado é apps_reais + 14; os helpers
// abaixo filtram só o nosso conjunto para comparar a ordem relativa.

const APP_NAMES = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot',
  'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima',
  'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo',
  'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'Xray',
  'Yankee', 'Zulu',
];

function makeApp(name: string): AppsStore.InstalledApp {
  const pkg = `com.example.${name.toLowerCase()}`;
  return { name, packageName: pkg, icon: `file:///${pkg}.png`, isSystem: false };
}

function mockApps(apps: AppsStore.InstalledApp[], overrides: Record<string, unknown> = {}) {
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps,
    homeApps: [],
    dockApps: [],
    nonDockApps: apps,
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
    hiddenApps: [],
    visibleApps: [],
    hideApp: jest.fn(),
    unhideApp: jest.fn(),
    iconCacheSizeBytes: 0,
    isRebuildingIconCache: false,
    iconCacheRebuildProgress: null,
    rebuildIconCache: jest.fn(() => Promise.resolve()),
    ...overrides,
  } as ReturnType<typeof AppsStore.useApps>);
}

function mockFolders(folders: FoldersStore.AppFolder[]) {
  jest.spyOn(FoldersStore, 'useFolders').mockReturnValue({
    folders,
    createFolder: jest.fn(),
    renameFolder: jest.fn(),
    addToFolder: jest.fn(),
    removeFromFolder: jest.fn(),
    deleteFolder: jest.fn(),
    getFolderForApp: jest.fn((pkg: string) => folders.find((f) => f.apps.includes(pkg))),
    isReady: true,
  } as ReturnType<typeof FoldersStore.useFolders>);
}

function seedSettings(partial: Record<string, unknown>) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    key === '@iostoandroid/settings'
      ? Promise.resolve(JSON.stringify(partial))
      : Promise.resolve(null),
  );
}

/** Recolhe os accessibilityLabels "Open <app>" por ordem de todas as páginas. */
function collectGridOrder(root: ReturnType<typeof render>, pageCount: number): string[] {
  const out: string[] = [];
  for (let p = 0; p < pageCount; p++) {
    const grid = root.getByTestId(`launcher-page-grid-${p}`);
    within(grid)
      .getAllByRole('button')
      .forEach((n) => {
        const label = n.props.accessibilityLabel as string | undefined;
        if (label?.startsWith('Open ')) out.push(label);
      });
  }
  return out;
}

/** Filtra só as apps do nosso conjunto (ignora as 14 BUILT_IN_APPS virtuais). */
function onlyMine(order: string[]): string[] {
  return order.filter((l) => APP_NAMES.some((n) => l === `Open ${n}`));
}

/** Conta os itens (apps + pastas) visíveis numa página específica. */
function countOnPage(root: ReturnType<typeof render>, pageIndex: number): number {
  const grid = root.getByTestId(`launcher-page-grid-${pageIndex}`);
  return within(grid).getAllByRole('button').length;
}

/** Muda a densidade ao vivo via SettingsStore (o mecanismo real do ecrã). */
function DensityProbe({ cols, rows }: { cols: 3 | 4 | 5 | 6; rows: 4 | 5 | 6 | 7 }) {
  const { update } = useSettings();
  return (
    <Pressable
      testID="density-probe"
      onPress={() => {
        update('gridColumns', cols);
        update('gridRows', rows);
      }}
    >
      <Text>probe</Text>
    </Pressable>
  );
}

/** O ScrollView horizontal do pager (o único com pagingEnabled). */
function getPager(root: ReturnType<typeof render>) {
  return root.UNSAFE_getAllByType(ScrollView).find(
    (n: { props: { pagingEnabled?: boolean } }) => n.props.pagingEnabled,
  );
}

/** Simula o fim do momentum scroll do pager numa página (handleScroll real). */
function scrollPagerTo(root: ReturnType<typeof render>, page: number, width: number) {
  fireEvent(getPager(root)!, 'momentumScrollEnd', {
    nativeEvent: {
      contentOffset: { x: page * width },
      contentSize: { width: (page + 1) * width },
      layoutMeasurement: { width },
    },
  });
}

/** Lê os dots do PageDots: { total, active } (active = -1 se nenhuma página activa). */
function readDots(root: ReturnType<typeof render>): { total: number; active: number } {
  const dots = root.UNSAFE_getAllByType(View).filter((n: { props: { style?: unknown } }) => {
    const s = StyleSheet.flatten(n.props.style) as Record<string, unknown> | undefined;
    return !!s && s.width === 7 && s.height === 7 && s.borderRadius === 3.5;
  });
  const active = dots.findIndex((n: { props: { style?: unknown } }) => {
    const s = StyleSheet.flatten(n.props.style) as Record<string, unknown> | undefined;
    return !!s && s.backgroundColor === '#ffffff';
  });
  return { total: dots.length, active };
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LauncherHomeScreen density migration (#503, ponto 2)', () => {
  it('preserves linear app order when changing 4x6 -> 5x5 and back', async () => {
    const apps = APP_NAMES.map(makeApp);
    // 4 cols x 6 rows = 24/page. Com 26 apps reais + 14 virtuais há 2 páginas.
    seedSettings({ gridColumns: 4, gridRows: 6 });
    mockApps(apps);
    mockFolders([]);

    const dense = render(<LauncherHomeScreen />);
    await waitFor(() => expect(dense.getByTestId('launcher-page-grid-1')).toBeTruthy(), { timeout: 3000 });
    const denseOrder = onlyMine(collectGridOrder(dense, 2));
    expect(denseOrder).toHaveLength(apps.length);
    dense.unmount();

    // 5 cols x 5 rows = 25/page. Mesmas 26 apps -> 2 páginas (25 + 1).
    seedSettings({ gridColumns: 5, gridRows: 5 });
    const sparse = render(<LauncherHomeScreen />);
    await waitFor(() => expect(sparse.getByTestId('launcher-page-grid-1')).toBeTruthy(), { timeout: 3000 });
    const sparseOrder = onlyMine(collectGridOrder(sparse, 2));
    expect(sparseOrder).toHaveLength(apps.length);
    sparse.unmount();

    // A ORDEM LINEAR tem de ser idêntica — re-embalar por chunk size não
    // reordena nenhuma app.
    expect(sparseOrder).toEqual(denseOrder);

    // Volta a 4x6: a ordem tem de continuar igual à original.
    seedSettings({ gridColumns: 4, gridRows: 6 });
    const back = render(<LauncherHomeScreen />);
    await waitFor(() => expect(back.getByTestId('launcher-page-grid-1')).toBeTruthy(), { timeout: 3000 });
    const backOrder = onlyMine(collectGridOrder(back, 2));
    expect(backOrder).toEqual(denseOrder);
    back.unmount();
  });

  it('keeps folders present across a density change (4x6 -> 5x5)', async () => {
    const apps = APP_NAMES.map(makeApp);
    const folder: FoldersStore.AppFolder = {
      id: 'f1',
      name: 'Work',
      apps: ['com.example.alpha', 'com.example.bravo', 'com.example.charlie'],
      color: '#007AFF',
    };

    seedSettings({ gridColumns: 4, gridRows: 6 });
    mockApps(apps);
    mockFolders([folder]);
    const dense = render(<LauncherHomeScreen />);
    await waitFor(() => expect(dense.getByTestId('launcher-page-grid-0')).toBeTruthy(), { timeout: 3000 });
    expect(dense.queryByLabelText('Open Work folder')).toBeTruthy();
    dense.unmount();

    seedSettings({ gridColumns: 5, gridRows: 5 });
    const sparse = render(<LauncherHomeScreen />);
    await waitFor(() => expect(sparse.getByTestId('launcher-page-grid-0')).toBeTruthy(), { timeout: 3000 });
    // A pasta tem de continuar a existir na grelha após a mudança de densidade.
    expect(sparse.queryByLabelText('Open Work folder')).toBeTruthy();
    sparse.unmount();
  });

  it('5x5 packs more of our apps on page 0 than 4x6 for the same app set', async () => {
    // 26 apps reais + 14 virtuais = 40 no total. 4x6 = 24/page, 5x5 = 25/page.
    // Isto prova que o chunk acompanha a densidade e não é uma constante 24.
    const apps = APP_NAMES.map(makeApp);

    seedSettings({ gridColumns: 4, gridRows: 6 });
    mockApps(apps);
    mockFolders([]);
    const dense = render(<LauncherHomeScreen />);
    await waitFor(() => expect(dense.getByTestId('launcher-page-grid-1')).toBeTruthy(), { timeout: 3000 });
    const densePage0Count = countOnPage(dense, 0);
    dense.unmount();

    seedSettings({ gridColumns: 5, gridRows: 5 });
    const sparse = render(<LauncherHomeScreen />);
    await waitFor(() => expect(sparse.getByTestId('launcher-page-grid-1')).toBeTruthy(), { timeout: 3000 });
    const sparsePage0Count = countOnPage(sparse, 0);
    sparse.unmount();

    expect(densePage0Count).toBe(24);
    expect(sparsePage0Count).toBe(25);
    expect(sparsePage0Count).toBeGreaterThan(densePage0Count);
  });

  it('clamps currentPage and the dots when a density change shrinks the page count', async () => {
    // Review follow-up: mudar a densidade encolhe o número de páginas e o
    // currentPage (que só muda em handleScroll) ficava para além de
    // totalPages — os dots perdiam a página activa e o offset ficava além do
    // conteúdo até ao próximo scroll. Tem de haver um reset: clampar a página
    // e o offset do pager juntos.
    const apps = APP_NAMES.map(makeApp); // 26 apps + 14 virtuais = 40 itens
    mockApps(apps);
    mockFolders([]);
    // 4x6 = 24/page -> 2 páginas de grelha + App Library = 3 páginas.
    seedSettings({ gridColumns: 4, gridRows: 6 });
    const root = render(
      <>
        <LauncherHomeScreen />
        <DensityProbe cols={6} rows={7} />
      </>,
    );

    await waitFor(() => expect(root.getByTestId('launcher-page-grid-1')).toBeTruthy(), { timeout: 3000 });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Dimensions } = require('react-native');
    const width = Dimensions.get('window').width;

    // Navega até à última página de grelha (page 2 de 3).
    scrollPagerTo(root, 2, width);
    await waitFor(() => {
      expect(readDots(root)).toEqual({ total: 3, active: 2 });
    });

    // 6x7 = 42/page -> 40 itens cabem numa página de grelha: 3 -> 2 páginas.
    fireEvent.press(root.getByTestId('density-probe'));

    // O pager tem de estabilizar: 2 dots e a página activa na última (1), não
    // em 2 (que já não existe). Antes do fix, active ficava em -1.
    await waitFor(() => {
      expect(readDots(root)).toEqual({ total: 2, active: 1 });
    });

    // Estável também depois de um scroll para a posição clampada.
    scrollPagerTo(root, 1, width);
    await waitFor(() => {
      expect(readDots(root)).toEqual({ total: 2, active: 1 });
    });
  });
});
