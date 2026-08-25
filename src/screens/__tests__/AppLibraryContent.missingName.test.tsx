import React from 'react';
import { render, waitFor } from '../../test-utils';
import { AppLibraryContent } from '../AppLibraryScreen';
import { DeviceContext, DeviceContextValue } from '../../store/DeviceStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import launcherModule from '../../../modules/launcher-module/src';
import { DEFAULT_SETTINGS } from '../../store/SettingsStore';

// ─── Regressão: App Library não pode rebentar quando uma app instalada tem o
// 'name' ausente (#696 / #699) ──────────────────────────────────────────────
//
// O `categorizeApp` (AppLibraryScreen.tsx:113) e o `AppIcon` local
// (AppLibraryScreen.tsx:155) faziam `app.name.toLowerCase()` /
// `app.name.charAt(0)` SEM guarda. Um payload nativo corrompido ou um índice em
// cache antigo pode entregar uma app com `name: undefined`. Como a
// AppLibraryContent é a ÚLTIMA página do pager da home (montada inline em
// LauncherHomeScreen), o throw derrubava o render do pager inteiro e a página
// da App Library aparecia em branco (ou caía o launcher). Os irmãos
// `packageName`/`category` já eram tratados como string vazia; o `name` tinha
// de sê-lo também.
//
// Exercitamos o caminho REAL: o LauncherModule (mockado) devolve uma app sem
// `name` e a AppLibraryContent tem de continuar a montar a grelha e a barra de
// pesquisa, em vez de rebentar.

type DeviceSms = DeviceContextValue['messages'][number];

function makeDevice(messages: DeviceSms[]): DeviceContextValue {
  return {
    battery: { level: 1, isCharging: false },
    brightness: 0.5,
    volume: 0.5,
    wifi: { enabled: false, ssid: '', rssi: 0, linkSpeed: 0, ip: '', networks: [] },
    wifiError: false,
    bluetooth: { enabled: false, name: '', address: '', pairedDevices: [] },
    bluetoothError: false,
    storage: { totalGB: '0', usedGB: '0', freeGB: '0', usedPercentage: 0 },
    storageError: false,
    network: { isConnected: false, isWifi: false, isCellular: false },
    messages,
    contacts: [],
    weather: { temp: 0, condition: '', icon: 'cloud', city: '' },
    notificationAccessGranted: null,
    isReady: true,
    refresh: async () => {},
    setBrightness: async () => {},
    setVolume: async () => {},
    toggleWifi: async () => {},
    toggleBluetooth: async () => {},
    openSystemPanel: async () => {},
    requestContactsPermission: async () => false,
    requestSmsPermission: async () => false,
    autoBrightness: true,
    setAutoBrightness: async () => {},
  };
}

const APPS_WITH_MISSING_NAME = [
  // App sem `name` (payload nativo corrompido / índice em cache antigo).
  { packageName: 'com.corrupt.app', icon: '', isSystem: false, category: 'social' } as never,
  { name: 'Spotify', packageName: 'com.spotify', icon: '', isSystem: false, category: 'undefined' } as never,
];

async function renderAppLibraryWithAppMissingName() {
  const saved = JSON.stringify({ ...DEFAULT_SETTINGS });
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    key === '@iostoandroid/settings' ? Promise.resolve(saved) : Promise.resolve(null),
  );
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  (launcherModule.getInstalledApps as jest.Mock).mockResolvedValue(APPS_WITH_MISSING_NAME);
  (launcherModule.isDefaultLauncher as jest.Mock).mockResolvedValue(false);

  const utils = render(
    <DeviceContext.Provider value={makeDevice([])}>
      <AppLibraryContent />
    </DeviceContext.Provider>,
  );
  // A grelha/cabeçalho têm de montar apesar da app sem nome.
  await waitFor(() => expect(utils.getAllByText('Categories').length).toBeGreaterThan(0));
  return utils;
}

describe('AppLibraryContent — app sem name não rebenta a grelha (#696)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('monta a barra de pesquisa e as categorias quando uma app tem name ausente', async () => {
    const { getByPlaceholderText, getByText } = await renderAppLibraryWithAppMissingName();
    // A barra de pesquisa (sempre presente) e o cabeçalho Categories têm de
    // aparecer — o render não pode ter rebentado.
    expect(getByPlaceholderText('Search')).toBeTruthy();
    expect(getByText('Categories')).toBeTruthy();
  });

  it('não lança quando a app sem name é cruzada pelo fallback de nomes (localeCompare)', async () => {
    const { getByText } = await renderAppLibraryWithAppMissingName();
    // Recently Added / Suggestions usam sort por .name no fallback — sem a
    // guarda, (undefined).localeCompare rebentaria aqui também.
    expect(getByText('Categories')).toBeTruthy();
  });
});
