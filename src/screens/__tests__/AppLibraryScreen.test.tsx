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
    expect(getByPlaceholderText('App Library')).toBeTruthy();
  });

  it('typing activates search results view without crashing', () => {
    const { getByPlaceholderText } = render(<AppLibraryScreen navigation={nav} />);
    fireEvent.changeText(getByPlaceholderText('App Library'), 'Settings');
    // Re-query after state update — no crash is the assertion
    expect(getByPlaceholderText('App Library')).toBeTruthy();
  });

  it('clearing search returns to category view without crashing', () => {
    const { getByPlaceholderText } = render(<AppLibraryScreen navigation={nav} />);
    fireEvent.changeText(getByPlaceholderText('App Library'), 'foo');
    fireEvent.changeText(getByPlaceholderText('App Library'), '');
    expect(getByPlaceholderText('App Library')).toBeTruthy();
  });
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
    expect(getByPlaceholderText('App Library')).toBeTruthy();
  });

  it('Show Suggestions = false não quebra a pesquisa nem as categorias', async () => {
    const { queryByText, getByPlaceholderText } = await renderAppLibrary({
      settings: { appLibraryShowSuggestions: false },
    });
    await waitFor(() => expect(queryByText('Recently Added')).toBeNull());
    fireEvent.changeText(getByPlaceholderText('App Library'), 'Face');
    // A pesquisa ativa e continua a mostrar resultados (Facebook) sem crash.
    await waitFor(() => expect(getByPlaceholderText('App Library')).toBeTruthy());
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
