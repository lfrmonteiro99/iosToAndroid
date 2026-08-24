import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, fireEvent, waitFor } from '../../../test-utils';
import { FocusScreen } from '../FocusScreen';
import { notificationCallbackForFocus } from '../../../utils/notificationFocusFilter';
import * as AppsStore from '../../../store/AppsStore';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

// DeviceStore/LocationStore mocked por inteiro (mesmo padrão de
// BluetoothScreen.test.tsx e useContextEngine.test.tsx) para controlar o
// snapshot Wi-Fi/Bluetooth/localização sem depender do bridge nativo real.
const mockUseDevice = jest.fn();
jest.mock('../../../store/DeviceStore', () => ({
  useDevice: () => mockUseDevice(),
  DeviceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DeviceContext: null,
}));

const mockUseLocation = jest.fn();
jest.mock('../../../store/LocationStore', () => ({
  useLocation: () => mockUseLocation(),
  LocationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  LocationContext: null,
}));

function baseDeviceValue() {
  return {
    wifi: { enabled: false, ssid: '', rssi: 0, linkSpeed: 0, ip: '', networks: [] },
    bluetooth: { enabled: false, name: '', address: '', pairedDevices: [] },
  };
}

function baseLocationValue() {
  return {
    currentLocation: null,
    history: [],
    permissionStatus: 'granted',
    isReady: true,
    requestPermission: jest.fn(),
    refreshLocation: jest.fn(() => Promise.resolve()),
    clearHistory: jest.fn(),
  };
}

beforeEach(() => {
  mockUseDevice.mockReturnValue(baseDeviceValue());
  mockUseLocation.mockReturnValue(baseLocationValue());
});

describe('FocusScreen', () => {
  it('renders all focus mode options', () => {
    const { getByText } = render(<FocusScreen navigation={mockNavigation as never} />);
    expect(getByText('Do Not Disturb')).toBeTruthy();
    expect(getByText('Sleep')).toBeTruthy();
    expect(getByText('Work')).toBeTruthy();
    expect(getByText('Personal')).toBeTruthy();
  });

  it('renders the screen without crashing', () => {
    const { toJSON } = render(<FocusScreen navigation={mockNavigation as never} />);
    expect(toJSON()).toBeTruthy();
  });

  it('hides From/To pickers when schedule is off', () => {
    const { queryByText } = render(<FocusScreen navigation={mockNavigation as never} />);
    expect(queryByText('From')).toBeNull();
    expect(queryByText('To')).toBeNull();
  });

  it('shows From/To pickers when schedule is toggled on, with default times', () => {
    const { getByText, getAllByRole } = render(<FocusScreen navigation={mockNavigation as never} />);

    // Liga o switch "Focus Schedule"
    const switches = getAllByRole('switch');
    const scheduleSwitch = switches[switches.length - 1];
    fireEvent.press(scheduleSwitch);

    expect(getByText('From')).toBeTruthy();
    expect(getByText('To')).toBeTruthy();
    // Valores por omissão 09:00 / 17:00
    expect(getByText('09:00')).toBeTruthy();
    expect(getByText('17:00')).toBeTruthy();
  });

  it('opens the From time picker and changes the start time', () => {
    const { getByText, getAllByText, getAllByRole } = render(<FocusScreen navigation={mockNavigation as never} />);

    const switches = getAllByRole('switch');
    fireEvent.press(switches[switches.length - 1]); // liga schedule

    fireEvent.press(getByText('From')); // abre o action sheet "From"

    // O action sheet está visível: o título "From" aparece (tile + título do sheet).
    expect(getAllByText('From').length).toBeGreaterThanOrEqual(1);
    // Escolhe uma hora diferente (12:30 existe no passo de 30 min).
    fireEvent.press(getByText('12:30'));

    // O novo valor reflete no tile.
    expect(getByText('12:30')).toBeTruthy();
  });

  it('opens the To time picker and changes the end time', () => {
    const { getByText, getAllByRole } = render(<FocusScreen navigation={mockNavigation as never} />);

    const switches = getAllByRole('switch');
    fireEvent.press(switches[switches.length - 1]);

    fireEvent.press(getByText('To'));
    fireEvent.press(getByText('20:00'));

    expect(getByText('20:00')).toBeTruthy();
  });

  it('does not mutate the To value when the From picker is used (independent fields)', () => {
    const { getByText, getAllByRole, queryByText } = render(<FocusScreen navigation={mockNavigation as never} />);

    const switches = getAllByRole('switch');
    fireEvent.press(switches[switches.length - 1]);

    fireEvent.press(getByText('From'));
    fireEvent.press(getByText('06:00'));

    // To mantém o default 17:00; o 06:00 só aparece uma vez (no From).
    expect(getByText('17:00')).toBeTruthy();
    // 06:00 deve aparecer exatamente 1x (no tile From); se tivesse vazado para To, apareceria 2x.
    const fromMatches = queryByText('06:00');
    expect(fromMatches).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Notification suppression unit tests (red step proven against pre-fix App.tsx)
// ---------------------------------------------------------------------------
describe('notificationCallbackForFocus — focus mode suppression', () => {
  const makeRefs = (focusMode: string) => ({
    seenIds: { current: new Set<string>() } as React.MutableRefObject<Set<string>>,
    focusModeRef: { current: focusMode } as React.MutableRefObject<string>,
  });

  const testNotif = { id: 'n1', title: 'Hello', text: 'World', packageName: 'com.test.app' };

  it('does NOT call setBanner when focus mode is active (doNotDisturb)', () => {
    const { seenIds, focusModeRef } = makeRefs('doNotDisturb');
    const setBanner = jest.fn();

    notificationCallbackForFocus(testNotif, seenIds, focusModeRef, setBanner);

    expect(setBanner).not.toHaveBeenCalled();
  });

  it('does NOT call setBanner when focus mode is active (sleep)', () => {
    const { seenIds, focusModeRef } = makeRefs('sleep');
    const setBanner = jest.fn();

    notificationCallbackForFocus(testNotif, seenIds, focusModeRef, setBanner);

    expect(setBanner).not.toHaveBeenCalled();
  });

  it('DOES call setBanner when focus mode is off', () => {
    const { seenIds, focusModeRef } = makeRefs('off');
    const setBanner = jest.fn();

    notificationCallbackForFocus(testNotif, seenIds, focusModeRef, setBanner);

    expect(setBanner).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Hello',
      body: 'World',
      appName: 'app',
    }));
  });

  it('does not re-show an already-seen notification id', () => {
    const { seenIds, focusModeRef } = makeRefs('off');
    seenIds.current.add('n1');
    const setBanner = jest.fn();

    notificationCallbackForFocus(testNotif, seenIds, focusModeRef, setBanner);

    expect(setBanner).not.toHaveBeenCalled();
  });

  it('silently ignores null/undefined notification', () => {
    const { seenIds, focusModeRef } = makeRefs('off');
    const setBanner = jest.fn();

    notificationCallbackForFocus(null, seenIds, focusModeRef, setBanner);
    notificationCallbackForFocus(undefined, seenIds, focusModeRef, setBanner);

    expect(setBanner).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Hidden Pages per Focus mode (#618)
// ---------------------------------------------------------------------------
// Monta o FocusScreen real: abre o multiselect de um modo, alterna uma página e
// verifica que a escolha vai para o AsyncStorage (persiste entre arranques) e
// que o resumo da linha muda. O modo 'off' não tem linha nenhuma — não filtra.
describe('FocusScreen — Hidden Pages (#618)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });

  it('renders one Hidden Pages row per mode, and none for Off', () => {
    const { getByText, queryByText } = render(
      <FocusScreen navigation={mockNavigation as never} />,
    );
    expect(getByText('Work — Hidden Pages')).toBeTruthy();
    expect(getByText('Sleep — Hidden Pages')).toBeTruthy();
    expect(getByText('Do Not Disturb — Hidden Pages')).toBeTruthy();
    expect(getByText('Personal — Hidden Pages')).toBeTruthy();
    expect(queryByText('Off — Hidden Pages')).toBeNull();
  });

  it('shows "None" until a page is hidden, then the count', async () => {
    const { getByText, getAllByText } = render(
      <FocusScreen navigation={mockNavigation as never} />,
    );
    expect(getAllByText('None').length).toBeGreaterThan(0);

    fireEvent.press(getByText('Work — Hidden Pages'));
    fireEvent.press(getByText('Page 1'));

    await waitFor(() => expect(getByText('1 hidden')).toBeTruthy());
  });

  it('persists focusPageVisibility to AsyncStorage (survives a restart)', async () => {
    const { getByText } = render(<FocusScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByText('Work — Hidden Pages'));
    fireEvent.press(getByText('Page 1'));

    await waitFor(() => {
      const write = (AsyncStorage.setItem as jest.Mock).mock.calls
        .filter(([key]) => key === '@iostoandroid/settings')
        .pop();
      expect(write).toBeTruthy();
      expect(JSON.parse(write![1] as string).focusPageVisibility).toEqual({ work: ['0'] });
    });
  });

  it('un-hides the page when the same row is tapped twice (double tap is a no-op)', async () => {
    const { getByText, getAllByText } = render(
      <FocusScreen navigation={mockNavigation as never} />,
    );

    fireEvent.press(getByText('Work — Hidden Pages'));
    fireEvent.press(getByText('Page 1'));
    await waitFor(() => expect(getByText('1 hidden')).toBeTruthy());

    fireEvent.press(getByText('Work — Hidden Pages'));
    fireEvent.press(getByText('✓ Page 1'));

    await waitFor(() => expect(getAllByText('None').length).toBeGreaterThan(0));
  });

  it('keeps each mode independent — hiding a Work page leaves Sleep untouched', async () => {
    const { getByText } = render(<FocusScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByText('Work — Hidden Pages'));
    fireEvent.press(getByText('Page 1'));

    await waitFor(() => {
      const write = (AsyncStorage.setItem as jest.Mock).mock.calls
        .filter(([key]) => key === '@iostoandroid/settings')
        .pop();
      expect(JSON.parse(write![1] as string).focusPageVisibility.sleep).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Dock Apps per Focus mode (#619, filho de #617)
// ---------------------------------------------------------------------------
// Monta o FocusScreen real: abre o picker de um modo, escolhe apps e verifica
// que a escolha vai para o AsyncStorage (persiste entre arranques) e que o
// resumo da linha muda. O modo 'off' não tem linha — nunca tem override.
describe('FocusScreen — Dock Apps (#619)', () => {
  function app(pkg: string, name: string): AppsStore.InstalledApp {
    return { name, packageName: pkg, icon: `file:///${pkg}.png`, isSystem: false };
  }

  const APPS = [app('com.slack', 'Slack'), app('com.gmail', 'Gmail'), app('com.notion', 'Notion')];

  function mockApps() {
    jest.spyOn(AppsStore, 'useApps').mockReturnValue({
      apps: APPS,
      homeApps: [],
      dockApps: [],
      nonDockApps: APPS,
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
      iconCacheSizeBytes: 0,
      isRebuildingIconCache: false,
      iconCacheRebuildProgress: null,
      rebuildIconCache: jest.fn(() => Promise.resolve()),
    } as ReturnType<typeof AppsStore.useApps>);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    mockApps();
  });

  it('renders one Dock Apps row per mode, and none for Off', () => {
    const { getByText, queryByText } = render(
      <FocusScreen navigation={mockNavigation as never} />,
    );
    expect(getByText('Work — Dock Apps')).toBeTruthy();
    expect(getByText('Sleep — Dock Apps')).toBeTruthy();
    expect(getByText('Do Not Disturb — Dock Apps')).toBeTruthy();
    expect(getByText('Personal — Dock Apps')).toBeTruthy();
    expect(queryByText('Off — Dock Apps')).toBeNull();
  });

  it('shows "Default" until an app is picked, then the count', async () => {
    const { getByText, getAllByText } = render(
      <FocusScreen navigation={mockNavigation as never} />,
    );
    expect(getAllByText('Default').length).toBeGreaterThan(0);

    fireEvent.press(getByText('Work — Dock Apps'));
    fireEvent.press(getByText('Slack'));

    await waitFor(() => expect(getByText('1 app')).toBeTruthy());
  });

  it('persists focusDockOverride to AsyncStorage (survives a restart)', async () => {
    const { getByText } = render(<FocusScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByText('Work — Dock Apps'));
    fireEvent.press(getByText('Slack'));
    // O action sheet fecha após cada opção (mesmo padrão do Hidden Pages
    // acima) — reabre antes da segunda escolha.
    fireEvent.press(getByText('Work — Dock Apps'));
    fireEvent.press(getByText('Gmail'));

    await waitFor(() => {
      const write = (AsyncStorage.setItem as jest.Mock).mock.calls
        .filter(([key]) => key === '@iostoandroid/settings')
        .pop();
      expect(write).toBeTruthy();
      expect(JSON.parse(write![1] as string).focusDockOverride).toEqual({
        work: ['com.slack', 'com.gmail'],
      });
    });
  });

  it('un-picks an app when tapped twice (double tap is a no-op)', async () => {
    const { getByText, getAllByText } = render(
      <FocusScreen navigation={mockNavigation as never} />,
    );

    fireEvent.press(getByText('Work — Dock Apps'));
    fireEvent.press(getByText('Slack'));
    await waitFor(() => expect(getByText('1 app')).toBeTruthy());

    fireEvent.press(getByText('Work — Dock Apps'));
    fireEvent.press(getByText('✓ Slack'));

    await waitFor(() => expect(getAllByText('Default').length).toBeGreaterThan(0));
  });

  it('keeps each mode independent — picking for Work leaves Sleep untouched', async () => {
    const { getByText } = render(<FocusScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByText('Work — Dock Apps'));
    fireEvent.press(getByText('Slack'));

    await waitFor(() => {
      const write = (AsyncStorage.setItem as jest.Mock).mock.calls
        .filter(([key]) => key === '@iostoandroid/settings')
        .pop();
      expect(JSON.parse(write![1] as string).focusDockOverride.sleep).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Context Engine — trigger de horário + combinador AND/OR (#642, filho #628)
// ---------------------------------------------------------------------------
// A engine pura (contextTriggerEngine.ts) já suporta múltiplas condições com
// AND/OR e o tipo `time`; o que faltava era o assistente "Add Automation"
// deste ecrã os expor. Estes testes montam o FocusScreen real e percorrem o
// wizard tal como um utilizador tocaria nos ecrãs, e a asserção final lê o
// blob persistido no AsyncStorage (mesmo padrão do Hidden Pages/Dock Apps
// acima) — não reimplementam a lógica de combinação.
describe('FocusScreen — Automation: horário + AND/OR (#642)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    mockUseDevice.mockReturnValue({
      wifi: { enabled: true, ssid: 'Home-5G', rssi: -40, linkSpeed: 100, ip: '', networks: [{ ssid: 'Home-5G' }] },
      bluetooth: { enabled: true, name: 'Phone', address: '11:22:33', pairedDevices: [{ name: 'Car Kit', address: 'AA:BB:CC' }] },
    });
    mockUseLocation.mockReturnValue(baseLocationValue());
  });

  function lastPersistedRules() {
    const write = (AsyncStorage.setItem as jest.Mock).mock.calls
      .filter(([key]) => key === '@iostoandroid/settings')
      .pop();
    expect(write).toBeTruthy();
    return JSON.parse(write![1] as string).contextRules;
  }

  // 'Work'/'Personal'/etc. também aparecem na lista "Focus Modes" no topo do
  // ecrã, por isso getByText (que exige exatamente 1 nó) é ambíguo depois de
  // abrir o sheet "Turn On" — escolhe sempre a última ocorrência (a opção do
  // sheet, que fica mais abaixo na árvore por ser montada depois).
  function pressModeOption(getAllByText: (text: string) => unknown[], label: string) {
    const matches = getAllByText(label);
    fireEvent.press(matches[matches.length - 1] as never);
  }

  it('offers a Time / Schedule trigger option alongside Wi-Fi/Bluetooth/Location', () => {
    const { getByText } = render(<FocusScreen navigation={mockNavigation as never} />);
    fireEvent.press(getByText('Add Automation'));
    expect(getByText('Time / Schedule')).toBeTruthy();
  });

  it('creates a single-condition Time rule (start/end + target mode), combinator defaults to AND', async () => {
    const { getByText, getAllByText } = render(<FocusScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByText('Add Automation'));
    fireEvent.press(getByText('Time / Schedule'));
    await waitFor(() => expect(getByText('12:30')).toBeTruthy());
    fireEvent.press(getByText('12:30')); // start
    await waitFor(() => expect(getByText('20:00')).toBeTruthy());
    fireEvent.press(getByText('20:00')); // end
    await waitFor(() => expect(getByText('Continue')).toBeTruthy());
    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(getByText('Which Focus mode should this automation activate?')).toBeTruthy());
    pressModeOption(getAllByText, 'Work');

    await waitFor(() => {
      const rules = lastPersistedRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].combinator).toBe('AND');
      expect(rules[0].targetMode).toBe('work');
      expect(rules[0].conditions).toEqual([
        { type: 'time', start: '12:30', end: '20:00', weekdays: [] },
      ]);
    });
  });

  it('combines a Wi-Fi condition and a Bluetooth condition with AND when the user picks "Require ALL"', async () => {
    const { getByText, getAllByText } = render(<FocusScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByText('Add Automation'));
    fireEvent.press(getByText('Wi-Fi Network'));
    await waitFor(() => expect(getByText('Home-5G')).toBeTruthy());
    fireEvent.press(getByText('Home-5G'));

    await waitFor(() => expect(getByText('Require ALL conditions (AND)')).toBeTruthy());
    fireEvent.press(getByText('Require ALL conditions (AND)'));

    await waitFor(() => expect(getByText('Bluetooth Device')).toBeTruthy());
    fireEvent.press(getByText('Bluetooth Device'));
    await waitFor(() => expect(getByText('Car Kit')).toBeTruthy());
    fireEvent.press(getByText('Car Kit'));

    await waitFor(() => expect(getByText('Continue')).toBeTruthy());
    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(getByText('Which Focus mode should this automation activate?')).toBeTruthy());
    pressModeOption(getAllByText, 'Personal');

    await waitFor(() => {
      const rules = lastPersistedRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].combinator).toBe('AND');
      expect(rules[0].targetMode).toBe('personal');
      expect(rules[0].conditions).toEqual([
        { type: 'wifi', ssid: 'Home-5G' },
        { type: 'bluetooth', address: 'AA:BB:CC' },
      ]);
    });
  });

  it('combines a Wi-Fi condition and a Bluetooth condition with OR when the user picks "Match ANY"', async () => {
    const { getByText, getAllByText } = render(<FocusScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByText('Add Automation'));
    fireEvent.press(getByText('Wi-Fi Network'));
    await waitFor(() => expect(getByText('Home-5G')).toBeTruthy());
    fireEvent.press(getByText('Home-5G'));

    await waitFor(() => expect(getByText('Match ANY condition (OR)')).toBeTruthy());
    fireEvent.press(getByText('Match ANY condition (OR)'));

    await waitFor(() => expect(getByText('Bluetooth Device')).toBeTruthy());
    fireEvent.press(getByText('Bluetooth Device'));
    await waitFor(() => expect(getByText('Car Kit')).toBeTruthy());
    fireEvent.press(getByText('Car Kit'));

    await waitFor(() => expect(getByText('Continue')).toBeTruthy());
    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(getByText('Which Focus mode should this automation activate?')).toBeTruthy());
    pressModeOption(getAllByText, 'Work');

    await waitFor(() => {
      const rules = lastPersistedRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].combinator).toBe('OR');
    });
  });

  it('still creates a single-condition rule when the user picks Continue right away (no regression)', async () => {
    const { getByText, getAllByText } = render(<FocusScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByText('Add Automation'));
    fireEvent.press(getByText('Wi-Fi Network'));
    await waitFor(() => expect(getByText('Home-5G')).toBeTruthy());
    fireEvent.press(getByText('Home-5G'));

    await waitFor(() => expect(getByText('Continue')).toBeTruthy());
    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(getByText('Which Focus mode should this automation activate?')).toBeTruthy());
    pressModeOption(getAllByText, 'Work');

    await waitFor(() => {
      const rules = lastPersistedRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].combinator).toBe('AND');
      expect(rules[0].conditions).toEqual([{ type: 'wifi', ssid: 'Home-5G' }]);
    });
  });

  it('cancelling the "add another condition?" step discards the whole automation (no partial rule persisted)', async () => {
    const { getByText, queryByText } = render(<FocusScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByText('Add Automation'));
    fireEvent.press(getByText('Wi-Fi Network'));
    await waitFor(() => expect(getByText('Home-5G')).toBeTruthy());
    fireEvent.press(getByText('Home-5G'));

    // O passo "Add Another Condition?" está aberto — fecha-o pelo Cancel em
    // vez de escolher AND/OR/Continue.
    await waitFor(() => expect(getByText('Require ALL conditions (AND)')).toBeTruthy());
    fireEvent.press(getByText('Cancel'));

    // A secção "Automation" continua sem nenhuma regra criada (header em
    // maiúsculas — CupertinoListSection aplica toUpperCase() ao header).
    expect(queryByText('AUTOMATION')).toBeTruthy();
    const writes = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
      ([key]) => key === '@iostoandroid/settings',
    );
    const anyPersistedRule = writes.some((w) => JSON.parse(w[1] as string).contextRules?.length > 0);
    expect(anyPersistedRule).toBe(false);
  });
});
