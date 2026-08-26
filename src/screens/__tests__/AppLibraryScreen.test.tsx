import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import { AppLibraryScreen, AppLibraryContent } from '../AppLibraryScreen';
import { DeviceContext, DeviceContextValue } from '../../store/DeviceStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import launcherModule from '../../../modules/launcher-module/src';
import { DEFAULT_SETTINGS } from '../../store/SettingsStore';

const nav = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as never;

beforeEach(() => jest.clearAllMocks());

describe('AppLibraryScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<AppLibraryScreen navigation={nav} />);
    expect(toJSON()).toBeTruthy();
  });

  it('shows the App Library search input', () => {
    const { getByPlaceholderText } = render(<AppLibraryScreen navigation={nav} />);
    // iOS App Library search bar always shows the "Search" placeholder.
    expect(getByPlaceholderText('Search')).toBeTruthy();
  });

  it('typing activates search results view without crashing', () => {
    const { getByPlaceholderText } = render(<AppLibraryScreen navigation={nav} />);
    fireEvent.changeText(getByPlaceholderText('Search'), 'Settings');
    // Re-query after state update — no crash is the assertion
    expect(getByPlaceholderText('Search')).toBeTruthy();
  });

  it('clearing search returns to category view without crashing', () => {
    const { getByPlaceholderText } = render(<AppLibraryScreen navigation={nav} />);
    fireEvent.changeText(getByPlaceholderText('Search'), 'foo');
    fireEvent.changeText(getByPlaceholderText('Search'), '');
    expect(getByPlaceholderText('Search')).toBeTruthy();
  });

  it('search bar placeholder is "Search", never the screen title "App Library" (#677)', () => {
    const { getByPlaceholderText } = render(<AppLibraryScreen navigation={nav} />);
    // O placeholder NÃO deve ser o título do ecrã.
    expect(() => getByPlaceholderText('App Library')).toThrow();
    expect(getByPlaceholderText('Search')).toBeTruthy();
  });
});

// ─── Regressão: settings.categoryOverrides corrompido não pode rebentar a App Library (#688) ───
//
// O SettingsStore funde o blob persistido do AsyncStorage por cima dos defaults
// (...parsed). Se categoryOverrides vier nulo/parcial/corrompido (upgrade de uma
// build anterior, blob truncado, etc.), settings.categoryOverrides fica inválido
// e AppLibraryContent → buildCategorySections faz `new Set(overrides.hidden)`
// sobre null/undefined → TypeError. Como a AppLibraryContent é também a última
// página da home (LauncherHomeScreen), o launcher inteiro crasha e o utilizador
// cai no launcher nativo do Android. Os irmãos iconShape/whitePointLevel/
// focusPageVisibility já são normalizados na leitura; categoryOverrides tinha de
// ser também. Aqui exercitamos o caminho real: SettingsProvider carrega o blob
// corrompido e a AppLibraryContent tem de continuar a renderizar.

describe('AppLibraryScreen — categoryOverrides corrompido no AsyncStorage (#688)', () => {
  const CORRUPT_VALUES: Array<[string, unknown]> = [
    ['null', null],
    ['undefined', undefined],
    ['string', 'social'],
    ['array', ['social']],
    ['partial sem appOverrides/renamed/order', { hidden: ['social'] }],
  ];

  it.each(CORRUPT_VALUES)(
    'não crasha quando categoryOverrides persistido é %s',
    async (_label, badValue) => {
      const saved = JSON.stringify({ ...DEFAULT_SETTINGS, categoryOverrides: badValue });
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
        key === '@iostoandroid/settings' ? Promise.resolve(saved) : Promise.resolve(null),
      );
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
      (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);

      const { getByPlaceholderText, findByTestId } = render(<AppLibraryScreen navigation={nav} />);
      // Após o SettingsProvider aplicar o settings corrompido, o ecrã continua a
      // montar. A prova disso era `findByText('Categories')` — mas estes casos
      // montam com ZERO apps (o módulo nativo mockado devolve lista vazia), e
      // esse cabeçalho aparecia sobre nada: era o header órfão que o #925
      // identificou, não sinal de vida. Com zero apps o que a UI deve mostrar é
      // o estado vazio, e é isso que prova aqui que renderizou sem crashar.
      await findByTestId('app-library-empty');
      expect(getByPlaceholderText('Search')).toBeTruthy();
    },
  );
});

// ─── Helpers para os testes dos toggles da App Library (#602) ──────────────
//
// A AppLibraryContent lê settings do SettingsProvider (AsyncStorage) e apps do
// LauncherModule (mockado). O badge vem de device.messages (SMS não lidas →
// app Messages), exatamente como na home (LauncherHomeScreen.tsx:1113). Para o
// badge ser exercitado na App Library, injetamos a app Messages como se fosse
// uma app real instalada — é o input real do componente, não uma reimplementação.

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

const APPS = [
  { name: 'Messages', packageName: 'com.iostoandroid.messages', icon: '', isSystem: false, category: 'social' },
  { name: 'Facebook', packageName: 'com.facebook', icon: '', isSystem: false, category: 'social' },
  { name: 'Spotify', packageName: 'com.spotify', icon: '', isSystem: false, category: 'undefined' },
] as never;

const UNREAD_SMS: DeviceSms[] = [
  { id: 'm1', address: '+15550001', body: 'unread', dateFormatted: 'now', type: 1, isRead: false },
  { id: 'm2', address: '+15550002', body: 'unread2', dateFormatted: 'now', type: 1, isRead: false },
];

async function renderAppLibrary(opts: {
  settings?: Record<string, unknown>;
  messages?: DeviceSms[];
} = {}) {
  const saved = JSON.stringify({ ...DEFAULT_SETTINGS, ...opts.settings });
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    key === '@iostoandroid/settings' ? Promise.resolve(saved) : Promise.resolve(null),
  );
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  (launcherModule.getInstalledApps as jest.Mock).mockResolvedValue(APPS);
  (launcherModule.isDefaultLauncher as jest.Mock).mockResolvedValue(false);

  const utils = render(
    <DeviceContext.Provider value={makeDevice(opts.messages ?? [])}>
      <AppLibraryContent />
    </DeviceContext.Provider>,
  );
  // Apps carregam de forma assíncrona a partir do mock do LauncherModule.
  await waitFor(() => expect(utils.getAllByText('Categories').length).toBeGreaterThan(0));
  return utils;
}

describe('AppLibraryContent — toggle Show Suggestions (#602)', () => {
  it('por defeito mostra as faixas Recently Added e Suggestions', async () => {
    const { getByText } = await renderAppLibrary();
    await waitFor(() => expect(getByText('Recently Added')).toBeTruthy());
    expect(getByText('Suggestions')).toBeTruthy();
  });

  it('Show Suggestions = false oculta ambas as faixas mas mantém Categories e Search', async () => {
    const { queryByText, getByPlaceholderText, getByText } = await renderAppLibrary({
      settings: { appLibraryShowSuggestions: false },
    });
    await waitFor(() => expect(queryByText('Recently Added')).toBeNull());
    expect(queryByText('Suggestions')).toBeNull();
    // O que NÃO deve mudar:
    expect(getByText('Categories')).toBeTruthy();
    // iOS App Library search bar always shows the "Search" placeholder.
    expect(getByPlaceholderText('Search')).toBeTruthy();
  });

  it('Show Suggestions = false não quebra a pesquisa nem as categorias', async () => {
    const { queryByText, getByPlaceholderText } = await renderAppLibrary({
      settings: { appLibraryShowSuggestions: false },
    });
    await waitFor(() => expect(queryByText('Recently Added')).toBeNull());
    fireEvent.changeText(getByPlaceholderText('Search'), 'Face');
    // A pesquisa ativa e continua a mostrar resultados (Facebook) sem crash.
    await waitFor(() => expect(getByPlaceholderText('Search')).toBeTruthy());
  });
});

describe('AppLibraryContent — toggle Show Notifications / badges (#602)', () => {
  it('por defeito mostra o badge (dot) da app Messages quando há SMS não lidas', async () => {
    const { getAllByTestId } = await renderAppLibrary({ messages: UNREAD_SMS });
    await waitFor(() =>
      expect(getAllByTestId('app-badge-com.iostoandroid.messages').length).toBeGreaterThan(0),
    );
  });

  it('Show Notifications = false oculta o badge da app Messages', async () => {
    const { queryAllByTestId } = await renderAppLibrary({
      settings: { appLibraryShowNotifications: false },
      messages: UNREAD_SMS,
    });
    await waitFor(() =>
      expect(queryAllByTestId('app-badge-com.iostoandroid.messages').length).toBe(0),
    );
  });

  it('sem SMS não lidas não mostra badge mesmo com notificações ligadas', async () => {
    const { queryAllByTestId } = await renderAppLibrary({ messages: [] });
    await waitFor(() =>
      expect(queryAllByTestId('app-badge-com.iostoandroid.messages').length).toBe(0),
    );
  });
});
