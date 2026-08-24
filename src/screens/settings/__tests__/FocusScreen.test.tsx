import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, fireEvent, waitFor } from '../../../test-utils';
import { FocusScreen } from '../FocusScreen';
import { notificationCallbackForFocus } from '../../../utils/notificationFocusFilter';
import * as AppsStore from '../../../store/AppsStore';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

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
// Priority Apps allow-list (#630) — apps que notificam sempre, mesmo em Focus
// ---------------------------------------------------------------------------
describe('FocusScreen — Priority Apps (#630)', () => {
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

  it('renders the Priority Apps row with "None" when empty', () => {
    const { getByText, getAllByText } = render(<FocusScreen navigation={mockNavigation as never} />);
    expect(getByText('Allow Notifications In Focus')).toBeTruthy();
    expect(getAllByText('None').length).toBeGreaterThan(0);
  });

  it('adds an app to the allow-list and persists it', async () => {
    const { getByText, getAllByText } = render(<FocusScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByText('Allow Notifications In Focus'));
    fireEvent.press(getByText('Slack'));

    await waitFor(() => expect(getByText('1 app')).toBeTruthy());

    await waitFor(() => {
      const write = (AsyncStorage.setItem as jest.Mock).mock.calls
        .filter(([key]) => key === '@iostoandroid/settings')
        .pop();
      expect(JSON.parse(write![1] as string).allowListImmediate).toEqual(['com.slack']);
    });
  });

  it('removes an app when tapped twice (double tap is a no-op)', async () => {
    const { getByText, getAllByText } = render(<FocusScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByText('Allow Notifications In Focus'));
    fireEvent.press(getByText('Slack'));
    await waitFor(() => expect(getByText('1 app')).toBeTruthy());

    fireEvent.press(getByText('Allow Notifications In Focus'));
    fireEvent.press(getByText('✓ Slack'));

    await waitFor(() => expect(getAllByText('None').length).toBeGreaterThan(0));
  });
});
