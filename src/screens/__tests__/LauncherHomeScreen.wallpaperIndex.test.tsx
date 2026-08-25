import React from 'react';
import { render, waitFor } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppsStore from '../../store/AppsStore';
import * as SettingsStore from '../../store/SettingsStore';
import { LauncherHomeScreen } from '../LauncherHomeScreen';
import { darkenHex } from '../../utils/wallpapers';

// issue #674: home renderiza em branco (RGB 250,250,250, só LogBox) em runtime
// Android. Causa raiz: `settings.wallpaperIndex` é lido do AsyncStorage (blob
// JSON não confiável de versões antigas) e NÃO é saneado no SettingsStore —
// ao contrário de `iconShape`/`whitePointLevel`/`focusPageVisibility` (que são
// normalizados na leitura, SettingsStore.tsx:414-424). Se o blob tiver um
// `wallpaperIndex` não-numérico/inválido, então:
//   WALLPAPERS[Math.min(settings.wallpaperIndex, WALLPAPERS.length-1)]
//     → WALLPAPERS[NaN] → undefined
//   darkenHex(undefined) → undefined.replace('#','') → TypeError DURANTE O RENDER.
// O throw é apanhado pelo ErrorBoundary; em build de preview não há redbox,
// dá ecrã branco. É específico da home porque o gradiente do wallpaper só é
// calculado aqui.
//
// RED: com wallpaperIndex inválido a home NÃO deve rebentar — tem de renderizar
// o conteúdo (wallpaper-layer + Search) como faria com um índice válido.
// Forçamos o valor exato que o SettingsStore (sem saneamento) produziria a
// partir de um blob corrompido, espiando useSettings.
function withSettings(overrides: Partial<SettingsStore.SettingsState>) {
  jest.spyOn(SettingsStore, 'useSettings').mockReturnValue({
    settings: { ...SettingsStore.DEFAULT_SETTINGS, ...overrides },
    update: jest.fn(),
    updateMany: jest.fn(),
    reset: jest.fn(),
    syncFromDevice: jest.fn(() => Promise.resolve()),
    isReady: true,
    activeFocusMode: null,
    setFocusMode: jest.fn(),
  } as unknown as ReturnType<typeof SettingsStore.useSettings>);
}

function mockApps(overrides: Record<string, unknown> = {}) {
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps: [], homeApps: [], dockApps: [], nonDockApps: [], recentPackages: [], recentApps: [],
    isLoading: false, refreshApps: jest.fn(() => Promise.resolve()), launchApp: jest.fn(() => Promise.resolve(true)),
    addToHome: jest.fn(), removeFromHome: jest.fn(),
    compactHomeLayout: jest.fn(), addToDock: jest.fn(), removeFromDock: jest.fn(),
    removeFromRecents: jest.fn(), clearRecents: jest.fn(), isDefaultLauncher: true,
    openLauncherSettings: jest.fn(() => Promise.resolve()), hiddenApps: [], visibleApps: [],
    hideApp: jest.fn(), unhideApp: jest.fn(), iconCacheSizeBytes: 0, isRebuildingIconCache: false,
    iconCacheRebuildProgress: null, rebuildIconCache: jest.fn(() => Promise.resolve()),
    ...overrides,
  } as ReturnType<typeof AppsStore.useApps>);
}

describe('LauncherHomeScreen — wallpaperIndex inválido (#674)', () => {
  beforeEach(() => { mockApps(); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('renderiza conteúdo quando wallpaperIndex é string não-numérica', async () => {
    withSettings({ wallpaperIndex: 'not-a-number' as unknown as number });
    const utils = render(<LauncherHomeScreen />);
    await waitFor(() => {
      expect(utils.getByTestId('wallpaper-layer')).toBeTruthy();
      expect(utils.getByText('Search')).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('renderiza conteúdo quando wallpaperIndex é NaN', async () => {
    withSettings({ wallpaperIndex: NaN });
    const utils = render(<LauncherHomeScreen />);
    await waitFor(() => {
      expect(utils.getByTestId('wallpaper-layer')).toBeTruthy();
      expect(utils.getByText('Search')).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('renderiza conteúdo com wallpaperIndex numérico fora de gama (clampa)', async () => {
    withSettings({ wallpaperIndex: 999 });
    const utils = render(<LauncherHomeScreen />);
    await waitFor(() => {
      expect(utils.getByTestId('wallpaper-layer')).toBeTruthy();
      expect(utils.getByText('Search')).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('darkenHex não rebenta com input inválido (undef/NaN)', () => {
    expect(() => darkenHex(undefined as unknown as string, 0.28)).not.toThrow();
    expect(() => darkenHex(NaN as unknown as string, 0.28)).not.toThrow();
  });
});

// Retrabalho #674: o saneamento não pode destruir o wallpaper personalizado.
// wallpaperIndex === 6 é o sentinel de custom (WallpaperScreen grava 6), por
// isso o clamp tem de o preservar e a home tem de continuar a pintar a imagem.
describe('LauncherHomeScreen — wallpaper personalizado (índice 6)', () => {
  beforeEach(() => {
    mockApps();
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === '@iostoandroid/custom_wallpaper' ? 'file:///custom.jpg' : null),
    );
  });
  afterEach(() => { jest.restoreAllMocks(); });

  it('renderiza o ImageBackground custom quando wallpaperIndex === 6', async () => {
    withSettings({ wallpaperIndex: 6 });
    const utils = render(<LauncherHomeScreen />);
    await waitFor(() => {
      expect(utils.getByTestId('wallpaper-custom-image')).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('mantém o custom mesmo com o índice em string "6" (blob legado)', async () => {
    withSettings({ wallpaperIndex: '6' as unknown as number });
    const utils = render(<LauncherHomeScreen />);
    await waitFor(() => {
      expect(utils.getByTestId('wallpaper-custom-image')).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('o inverso do fix: índice de cor (2) NÃO mostra a imagem custom', async () => {
    withSettings({ wallpaperIndex: 2 });
    const utils = render(<LauncherHomeScreen />);
    await waitFor(() => expect(utils.getByTestId('wallpaper-layer')).toBeTruthy(), { timeout: 3000 });
    expect(utils.queryByTestId('wallpaper-custom-image')).toBeNull();
  });

  it('índice 6 sem imagem guardada cai no gradiente, sem rebentar', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    withSettings({ wallpaperIndex: 6 });
    const utils = render(<LauncherHomeScreen />);
    await waitFor(() => expect(utils.getByTestId('wallpaper-layer')).toBeTruthy(), { timeout: 3000 });
    expect(utils.queryByTestId('wallpaper-custom-image')).toBeNull();
  });
});
