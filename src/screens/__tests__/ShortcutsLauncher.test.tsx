import React from 'react';
import { render, fireEvent, act } from '../../test-utils';
import { LauncherHomeScreen } from '../LauncherHomeScreen';
import { BUILT_IN_APPS, VIRTUAL_ICON_CONFIG } from '../LauncherHomeScreen';
import * as AppsStore from '../../store/AppsStore';

// Integration proof (#782, pedido do reviewer): o ícone "Shortcuts" do
// launcher tem de chegar de facto ao ShortcutsScreen. Isto não é um teste que
// reimplementa a navegação — monta o LauncherHomeScreen REAL eprime o ícone
// REAL (etiqueta `Open Shortcuts`), depois verifica que o handler de press
// real (handleAppPress → BUILT_IN_APPS[packageName] → navigation.navigate)
// foi disparado com a rota 'Shortcuts'.

jest.mock('@react-navigation/native', () => {
  const navigate = jest.fn();
  return {
    __esModule: true,
    useNavigation: () => ({
      navigate,
      goBack: jest.fn(),
      canGoBack: jest.fn(() => false),
      getParent: () => ({ navigate: jest.fn() }),
    }),
    useRoute: () => ({ params: {} }),
    NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
    __navigate: navigate,
  };
});

// Keep a minimal apps list so the grid lays out without touching real device
// state. The built-in virtual icons (incluindo Shortcuts) vêm de BUILT_IN_APPS
// e são adicionados independentemente desta lista.
jest.mock('../../store/AppsStore', () => {
  const actual = jest.requireActual('../../store/AppsStore');
  return {
    ...actual,
    useApps: () => ({
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
      compactHomeLayout: jest.fn(),
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
    }),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Shortcuts launcher wiring', () => {
  it('maps the built-in package to the Shortcuts route and has a virtual icon', () => {
    expect(BUILT_IN_APPS['com.iostoandroid.shortcuts']).toBe('Shortcuts');
    expect(VIRTUAL_ICON_CONFIG['com.iostoandroid.shortcuts']).toBeDefined();
    expect(VIRTUAL_ICON_CONFIG['com.iostoandroid.shortcuts'].icon).toBe('flash');
  });

  it('pressing the Shortcuts launcher icon navigates to the Shortcuts route', async () => {
    const { getByLabelText } = render(<LauncherHomeScreen />);

    // O ícone virtual de Shortcuts recebe a etiqueta `Open Shortcuts`.
    const icon = getByLabelText('Open Shortcuts');
    fireEvent.press(icon);

    await act(async () => {
      await Promise.resolve();
    });

    const nav = jest.requireMock('@react-navigation/native').__navigate;
    expect(nav).toHaveBeenCalledWith('Shortcuts');
  });
});
