import React from 'react';
import { View as RNView, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, fireEvent, within, waitFor } from '../../test-utils';
import {
  LauncherHomeScreen,
  NonAndroidFallback,
  computeWallpaperTranslateX,
  PARALLAX_OVERHANG,
  BUILT_IN_APP_ANDROID_ALIASES,
  BUILT_IN_DUPLICATE_PACKAGES,
  resolveHomePressAction,
} from '../LauncherHomeScreen';
import * as DeviceStore from '../../store/DeviceStore';
import * as AppsStore from '../../store/AppsStore';
import { Shape } from '../../theme/CupertinoTheme';

function flattenStyle(style: unknown): Record<string, unknown>[] {
  if (Array.isArray(style)) return style.flat(Infinity).filter(Boolean) as Record<string, unknown>[];
  return style ? [style as Record<string, unknown>] : [];
}

describe('LauncherHomeScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<LauncherHomeScreen />);
    expect(toJSON()).toBeTruthy();
  });

  // #481: dock corner radius must consume Shape.dock (34), not the old
  // hand-picked literal (22) — 35% below spec §1.6.
  it('renders the dock at the Shape.dock radius (34)', () => {
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
      hiddenApps: [],
      visibleApps: [],
      hideApp: jest.fn(),
      unhideApp: jest.fn(),
      iconCacheSizeBytes: 0,
      isRebuildingIconCache: false,
      iconCacheRebuildProgress: null,
      rebuildIconCache: jest.fn(() => Promise.resolve()),
    } as ReturnType<typeof AppsStore.useApps>);

    const { UNSAFE_getByType } = render(<LauncherHomeScreen />);
    const dockBlur = UNSAFE_getByType('BlurView' as never);
    const flat = flattenStyle(dockBlur.props.style);
    const radiusStyle = flat.find((s) => 'borderRadius' in s) as { borderRadius: number } | undefined;

    expect(radiusStyle).toBeDefined();
    expect(radiusStyle?.borderRadius).toBe(Shape.dock.radius);
    expect(radiusStyle?.borderRadius).toBe(34);

    jest.restoreAllMocks();
  });

  it('renders the home screen container', () => {
    const { toJSON } = render(<LauncherHomeScreen />);
    const tree = toJSON();
    expect(tree).toBeTruthy();
  });

  it('renders page dots or app grid', () => {
    const { toJSON } = render(<LauncherHomeScreen />);
    expect(toJSON()).toBeTruthy();
  });
});

// H7: the screen ticks a 60s clock (`setInterval(() => setNow(...), 60_000)`)
// in its own effect. It's mounted as the navigator root so it rarely unmounts
// in production, but lock/unlock cycles and hot reload can remount it — a
// dropped `clearInterval` would leak one timer handle per mount and, if the
// stale interval ever fired, call `setState` on a detached component.
//
// These spy on the real global setInterval/clearInterval and filter by the
// screen's 60_000ms delay, rather than asserting a raw Jest timer count,
// because other providers in the test tree (DeviceStore's 30s poll,
// SettingsStore's 500ms sync fallback) register their own timers on the same
// tree — a global count would conflate their cleanup with this screen's.
describe('LauncherHomeScreen clock interval cleanup (H7)', () => {
  const CLOCK_DELAY_MS = 60_000;

  function clockIntervalCalls(setIntervalSpy: jest.SpyInstance) {
    return setIntervalSpy.mock.calls
      .map((args, i) => ({ delay: args[1], id: setIntervalSpy.mock.results[i].value }))
      .filter((call) => call.delay === CLOCK_DELAY_MS);
  }

  // Fake timers: a leaked `setInterval` must not become a real pending OS
  // timer that keeps the Jest process alive after the file finishes.
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('clears the clock interval on unmount', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

    const { unmount } = render(<LauncherHomeScreen />);

    const calls = clockIntervalCalls(setIntervalSpy);
    expect(calls).toHaveLength(1);

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalledWith(calls[0].id);

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it('does not leak the clock interval across rapid mount/unmount cycles', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

    for (let i = 0; i < 20; i++) {
      const { unmount } = render(<LauncherHomeScreen />);
      unmount();
    }

    const calls = clockIntervalCalls(setIntervalSpy);
    expect(calls).toHaveLength(20);

    const clearedIds = new Set(clearIntervalSpy.mock.calls.map(([id]) => id));
    for (const { id } of calls) {
      expect(clearedIds.has(id)).toBe(true);
    }

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});

// #433: the wallpaper parallax layer translated by a raw fraction of the
// scroll offset (`scrollX.value * 0.3`) while the layer itself was only
// oversized by a fixed 20px overhang, and the two numbers were never derived
// from each other. With 3 pages the scroll range is 2 * SCREEN_WIDTH, so the
// translation (~648px) vastly exceeded the overhang (20px) and the layer slid
// off, exposing bare background on later pages.
//
// `computeWallpaperTranslateX` is the exact function `wallpaperAnimStyle`
// calls inside its worklet (LauncherHomeScreen.tsx) — these tests call it
// directly rather than mounting the screen and driving a real scroll, because
// the Reanimated jest mock (jest.setup.js) hands back a brand-new plain object
// from every `useSharedValue()` call instead of a ref-persisted one, so a
// mutate-then-rerender against the mounted component can never observe its own
// mutation (see `reanimated-jest-animation-target-testing` skill). Testing the
// real exported unit sidesteps that mock limitation without reimplementing it.
describe('LauncherHomeScreen wallpaper parallax (#433)', () => {
  it('sits at +overhang on the first page (progress 0)', () => {
    expect(computeWallpaperTranslateX(0, 1000, 20)).toBe(20);
  });

  it('sits at -overhang on the last page (progress 1)', () => {
    expect(computeWallpaperTranslateX(1000, 1000, 20)).toBe(-20);
  });

  it('sits at 0 at the exact midpoint', () => {
    expect(computeWallpaperTranslateX(500, 1000, 20)).toBe(0);
  });

  it('never exceeds the overhang, for any page count or scroll position', () => {
    // Regression check for the reported bug: with the old formula
    // `-(scrollX * 0.3)`, 3 pages at SCREEN_WIDTH=1080 produced ~-648, a 32x
    // overshoot against a 20px overhang. This sweeps page counts and
    // fractions the same way a user's swipe would drive scrollX.
    for (const totalPages of [2, 3, 5, 8, 20]) {
      const maxScrollX = (totalPages - 1) * 1080;
      for (let fraction = 0; fraction <= 1; fraction += 0.1) {
        const translateX = computeWallpaperTranslateX(maxScrollX * fraction, maxScrollX, PARALLAX_OVERHANG);
        expect(Math.abs(translateX)).toBeLessThanOrEqual(PARALLAX_OVERHANG);
      }
    }
  });

  it('still clamps to the overhang during overscroll/bounce (scrollX outside [0, maxScrollX])', () => {
    expect(Math.abs(computeWallpaperTranslateX(-50, 1000, 20))).toBeLessThanOrEqual(20);
    expect(Math.abs(computeWallpaperTranslateX(1500, 1000, 20))).toBeLessThanOrEqual(20);
  });

  it('does not divide by zero when there is no scrollable range (a single page)', () => {
    const translateX = computeWallpaperTranslateX(0, 0, 20);
    expect(Number.isFinite(translateX)).toBe(true);
    expect(Math.abs(translateX)).toBeLessThanOrEqual(20);
  });

  it('still shifts noticeably between the first and last page (parallax is not flattened to zero)', () => {
    const atStart = computeWallpaperTranslateX(0, 2160, PARALLAX_OVERHANG);
    const atEnd = computeWallpaperTranslateX(2160, 2160, PARALLAX_OVERHANG);
    expect(Math.abs(atEnd - atStart)).toBeGreaterThan(1);
  });

  // Guards against the root cause named in the issue: the overhang used to
  // oversize the layer and the overhang used to bound the translation must be
  // the SAME constant, or they can drift apart again exactly like before.
  it('oversizes the wallpaper layer by exactly PARALLAX_OVERHANG on both sides', () => {
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
      hiddenApps: [],
      visibleApps: [],
      hideApp: jest.fn(),
      unhideApp: jest.fn(),
      iconCacheSizeBytes: 0,
      isRebuildingIconCache: false,
      iconCacheRebuildProgress: null,
      rebuildIconCache: jest.fn(() => Promise.resolve()),
    } as ReturnType<typeof AppsStore.useApps>);

    const { getByTestId } = render(<LauncherHomeScreen />);
    const layer = getByTestId('wallpaper-layer');
    const flat = flattenStyle(layer.props.style);
    // StyleSheet.absoluteFillObject also sets `left`/`right` (to 0) earlier in
    // the same style array, so skip that one and take the overhang override.
    const overhangStyle = flat.find((s) => 'left' in s && (s as { left: number }).left !== 0) as {
      left: number;
      right: number;
    };

    expect(overhangStyle.left).toBe(-PARALLAX_OVERHANG);
    expect(overhangStyle.right).toBe(-PARALLAX_OVERHANG);

    jest.restoreAllMocks();
  });
});

describe('NonAndroidFallback battery widget', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('shows device.battery.level instead of the 72% literal', () => {
    // Red step: broken code always renders '72%'; fixed code uses device.battery.level.
    // With level=0.41 → Math.round(0.41 * 100) = 41 → widget shows '41%', never '72%'.
    jest.spyOn(DeviceStore, 'useDevice').mockReturnValue({
      battery: { level: 0.41, isCharging: false },
    } as ReturnType<typeof DeviceStore.useDevice>);

    const { getByText, queryByText } = render(<NonAndroidFallback />);

    expect(queryByText('72%')).toBeNull();
    expect(getByText('41%')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// #438: built-in apps rendered twice — the internal built-in icon plus the real
// Android app with the same label (one goes to the internal screen, the other
// launches e.g. the Google Dialer).
// ---------------------------------------------------------------------------
describe('LauncherHomeScreen built-in duplicate suppression (#438)', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  function mockApps(allApps: AppsStore.InstalledApp[], dock: string[] = []) {
    const dockApps = allApps.filter((a) => dock.includes(a.packageName));
    const nonDockApps = allApps.filter((a) => !dock.includes(a.packageName));
    const launchApp = jest.fn(() => Promise.resolve(true));
    jest.spyOn(AppsStore, 'useApps').mockReturnValue({
      apps: allApps,
      homeApps: [],
      dockApps,
      nonDockApps,
      recentPackages: [],
      recentApps: [],
      isLoading: false,
      refreshApps: jest.fn(() => Promise.resolve()),
      launchApp,
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
    } as ReturnType<typeof AppsStore.useApps>);
    return { launchApp };
  }

  const realApp = (name: string, packageName: string): AppsStore.InstalledApp => ({
    name,
    packageName,
    icon: '',
    isSystem: true,
  });

  const GOOGLE_DUPES = [
    realApp('Phone', 'com.google.android.dialer'),
    realApp('Messages', 'com.google.android.apps.messaging'),
    realApp('Calendar', 'com.google.android.calendar'),
  ];

  it('renders each built-in label exactly once when the Google equivalents are installed', () => {
    mockApps(GOOGLE_DUPES);
    const { queryAllByLabelText } = render(<LauncherHomeScreen />);

    for (const label of ['Open Phone', 'Open Messages', 'Open Calendar']) {
      expect(queryAllByLabelText(label)).toHaveLength(1);
    }
  });

  it('does not render the real Google packages at all (they are excluded, not relabelled)', () => {
    mockApps(GOOGLE_DUPES);
    const { queryAllByLabelText } = render(<LauncherHomeScreen />);
    // 3 built-ins would become 6 icons if the real apps came through.
    const total = ['Open Phone', 'Open Messages', 'Open Calendar']
      .reduce((n, label) => n + queryAllByLabelText(label).length, 0);
    expect(total).toBe(3);
  });

  it('keeps built-ins visible exactly once when NO real Android duplicates are installed', () => {
    mockApps([]);
    const { queryAllByLabelText } = render(<LauncherHomeScreen />);
    expect(queryAllByLabelText('Open Phone')).toHaveLength(1);
    expect(queryAllByLabelText('Open Weather')).toHaveLength(1);
  });

  it('still shows third-party apps that have no built-in equivalent', () => {
    mockApps([realApp('Chess Deluxe', 'com.example.chess'), ...GOOGLE_DUPES]);
    const { queryAllByLabelText } = render(<LauncherHomeScreen />);
    expect(queryAllByLabelText('Open Chess Deluxe')).toHaveLength(1);
  });

  it('does not duplicate a built-in that lives in the dock', () => {
    // Built-in in dock + real Android equivalent installed: the built-in must
    // appear once (dock) and the real app not at all.
    const builtInPhone = realApp('Phone', 'com.iostoandroid.phone');
    mockApps([builtInPhone, ...GOOGLE_DUPES], ['com.iostoandroid.phone']);
    const { queryAllByLabelText } = render(<LauncherHomeScreen />);
    expect(queryAllByLabelText('Open Phone')).toHaveLength(1);
  });

  it('routes the surviving Phone icon to the internal screen, never launchApp', () => {
    const { launchApp } = mockApps(GOOGLE_DUPES);
    const { getByLabelText } = render(<LauncherHomeScreen />);
    fireEvent.press(getByLabelText('Open Phone'));
    expect(launchApp).not.toHaveBeenCalled();
  });

  it('the alias map only covers built-in packages and never lists a com.iostoandroid.* package as a duplicate', () => {
    for (const [builtIn, aliases] of Object.entries(BUILT_IN_APP_ANDROID_ALIASES)) {
      expect(builtIn.startsWith('com.iostoandroid.')).toBe(true);
      for (const alias of aliases) {
        expect(alias.startsWith('com.iostoandroid.')).toBe(false);
        expect(BUILT_IN_DUPLICATE_PACKAGES.has(alias)).toBe(true);
      }
    }
  });

  it('leaves an unlisted OEM dialer visible (the filter is an explicit alias list, not a heuristic)', () => {
    mockApps([realApp('Samsung Phone', 'com.samsung.android.dialer')]);
    const { queryAllByLabelText } = render(<LauncherHomeScreen />);
    expect(queryAllByLabelText('Open Samsung Phone')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// #434: the last home page used to be a tap-through placeholder ("App
// Library" / "Tap to open all apps") that pushed a separate stack screen.
// On iOS the App Library IS the last page — swiping past the last app page
// must show it already filled in, no extra tap.
// ---------------------------------------------------------------------------
describe('LauncherHomeScreen last page is the App Library itself (#434)', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  // Mirrors the #438 describe block above: LauncherHomeScreen renders only
  // a loading spinner while `isLoading` is true, and the real AppsProvider
  // stays in that state synchronously in tests (its load is async, jest's
  // render() does not await it) — so any test asserting on real page
  // content must bypass the provider like this, or it fails for the wrong
  // reason (stuck on the loading spinner) instead of the one under test.
  function mockLoadedApps(over: Partial<ReturnType<typeof AppsStore.useApps>> = {}) {
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
      hiddenApps: [],
      visibleApps: [],
      hideApp: jest.fn(),
      unhideApp: jest.fn(),
      iconCacheSizeBytes: 0,
      isRebuildingIconCache: false,
      iconCacheRebuildProgress: null,
      rebuildIconCache: jest.fn(() => Promise.resolve()),
      ...over,
    } as ReturnType<typeof AppsStore.useApps>);
  }

  // A MESMA APP NA GRELHA E NA BIBLIOTECA.
  //
  // Com a biblioteca a ser a ultima pagina do MESMO ScrollView, uma app que esteja
  // na grelha do home E em "Recently Added" fica renderizada duas vezes na mesma
  // arvore. Sem desambiguacao, ambas expoem `Open <nome>` e uma query por esse
  // label passa a devolver dois nos: quebra os testes e, mais grave, deixa o
  // TalkBack com dois botoes indistinguiveis que fazem coisas diferentes.
  //
  // O mock por omissao tem `recentApps: []`, portanto NUNCA exercita este caminho:
  // os testes do caminho feliz passariam com a desambiguacao removida.
  it('nao duplica o label de acessibilidade quando a app esta na grelha e em Recently Added', () => {
    const app = { name: 'Chrome', packageName: 'com.android.chrome', icon: '', isSystem: false };
    mockLoadedApps({
      apps: [app],
      // #606: a App Library lista `visibleApps` (apps menos as escondidas); só
      // a procura lê `apps`. Sem isto a biblioteca vinha vazia neste mock.
      visibleApps: [app],
      nonDockApps: [app],   // grelha do home
      // `recentApps` e ordenado por `launchedAt` e cruzado contra `apps` pelo
      // packageName (AppLibraryScreen.tsx:355-364) — sem o timestamp a app nao
      // chega a "Recently Added" e o teste passaria sem exercitar nada.
      recentApps: [{ ...app, launchedAt: Date.now() }],
      recentPackages: [app.packageName],
    } as Partial<ReturnType<typeof AppsStore.useApps>>);

    const { queryAllByLabelText } = render(<LauncherHomeScreen />);

    // O que importa: o label da GRELHA continua unico. Sem a desambiguacao os
    // nos da biblioteca partilhariam `Open Chrome` e isto daria 3.
    expect(queryAllByLabelText('Open Chrome')).toHaveLength(1);

    // A biblioteca renderiza a app em mais do que uma seccao ("Recently Added" e
    // "Suggestions"), todas sob o sufixo proprio. Nao se afirma um numero exacto
    // — isso prenderia o teste ao layout da biblioteca em vez de a colisao de
    // labels, que e o que esta em causa. Afirma-se que existem e que estao todas
    // desambiguadas.
    const naBiblioteca = queryAllByLabelText('Open Chrome, App Library');
    expect(naBiblioteca.length).toBeGreaterThan(0);
  });

  it('shows the App Library search bar directly on mount, with no tap required', () => {
    mockLoadedApps();
    const { getByPlaceholderText } = render(<LauncherHomeScreen />);
    expect(getByPlaceholderText('App Library')).toBeTruthy();
  });

  it('shows the Categories section directly, without navigating anywhere first', () => {
    mockLoadedApps();
    const { getByText } = render(<LauncherHomeScreen />);
    expect(getByText('Categories')).toBeTruthy();
  });

  it('does not render the old "Tap to open all apps" placeholder anymore', () => {
    mockLoadedApps();
    const { queryByText } = render(<LauncherHomeScreen />);
    expect(queryByText('Tap to open all apps')).toBeNull();
  });

  it('does not render the old placeholder "Open App Library" tap target anymore', () => {
    mockLoadedApps();
    const { queryByLabelText } = render(<LauncherHomeScreen />);
    expect(queryByLabelText('Open App Library')).toBeNull();
  });

  it('the embedded library is the real interactive component, not a static copy: typing into its search bar filters results', () => {
    mockLoadedApps();
    const { getByPlaceholderText, getByText, queryByText } = render(<LauncherHomeScreen />);
    // "Categories" heading is only shown outside search mode; typing switches
    // to the search-results view, proving the search bar is wired to real
    // state inside the embedded component, not just visually present.
    expect(getByText('Categories')).toBeTruthy();
    fireEvent.changeText(getByPlaceholderText('App Library'), 'zzz-no-such-app');
    expect(queryByText('Categories')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// #508: HOME re-delivers the intent via onNewIntent (singleTask launchMode),
// but nothing consumed it — the button was dead whenever the launcher was
// already in the foreground (folder open, App Library page, page 3, ...).
// resolveHomePressAction is the pure decision table behind the fix: given
// what's open, what should HOME do. Kept pure and exported so every starting
// state is asserted directly, without mounting the screen or a real ScrollView.
// ---------------------------------------------------------------------------
describe('resolveHomePressAction (#508)', () => {
  it('closes the folder when a folder is open and already on the first page', () => {
    expect(resolveHomePressAction({ isFolderOpen: true, isOnFirstPage: true })).toBe('closeFolder');
  });

  it('scrolls to the first page when no folder is open and not on the first page', () => {
    expect(resolveHomePressAction({ isFolderOpen: false, isOnFirstPage: false })).toBe('scrollToFirstPage');
  });

  it('both closes the folder and scrolls to the first page when a folder is open on a page other than the first', () => {
    expect(resolveHomePressAction({ isFolderOpen: true, isOnFirstPage: false })).toBe('closeFolderAndScrollToFirstPage');
  });

  it('does nothing when already on the first page with no folder open (must not flicker)', () => {
    expect(resolveHomePressAction({ isFolderOpen: false, isOnFirstPage: true })).toBe('none');
  });

  // The App Library is the last page of the same pager (#434), not a
  // separate overlay — from this function's point of view it's just
  // isOnFirstPage: false, identical to being on any other non-first page.
  it('treats being on the App Library page the same as any other non-first page', () => {
    expect(resolveHomePressAction({ isFolderOpen: false, isOnFirstPage: false })).toBe('scrollToFirstPage');
  });
});

// ---------------------------------------------------------------------------
// #490: Pagination ScrollView decelerationRate must match iOS spec (0.998)
// to ensure proper scroll deceleration and page snapping on Android.
// The fix adds `decelerationRate={0.998}` to the horizontal pagination
// ScrollView (§3.3 of ESPECIFICACAO.md).
// ---------------------------------------------------------------------------
describe('LauncherHomeScreen pagination ScrollView deceleration (#490)', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  function mockLoadedApps(over: Partial<ReturnType<typeof AppsStore.useApps>> = {}) {
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
      hiddenApps: [],
      visibleApps: [],
      hideApp: jest.fn(),
      unhideApp: jest.fn(),
      ...over,
    } as ReturnType<typeof AppsStore.useApps>);
  }

  it('sets decelerationRate to 0.998 on the pagination ScrollView', () => {
    mockLoadedApps();
    const { getByTestId } = render(<LauncherHomeScreen />);

    const paginationScrollView = getByTestId('launcher-pager');
    expect(paginationScrollView.props.decelerationRate).toBe(0.998);
  });
});

// ---------------------------------------------------------------------------
// #501: the dock reused the same AppIcon rendered for the home grid, which
// always draws a name label below the icon — the iOS dock has no labels.
// This inflated the dock capsule to ~108pt (padding 20 + the grid's 88pt
// label-inclusive wrapper) instead of the ~96pt from §2. AppIcon gets a
// `showLabel` prop (default true, so the grid is untouched) instead of a
// second component, per the issue's explicit "um só AppIcon" requirement.
// ---------------------------------------------------------------------------
describe('LauncherHomeScreen dock has no app-name labels (#501)', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  const dockApp: AppsStore.InstalledApp = {
    name: 'DockOnlyApp',
    packageName: 'com.example.dockonly',
    icon: '',
    isSystem: false,
  };
  const gridApp: AppsStore.InstalledApp = {
    name: 'GridOnlyApp',
    packageName: 'com.example.gridonly',
    icon: '',
    isSystem: false,
  };

  function mockApps(dockApps: AppsStore.InstalledApp[], nonDockApps: AppsStore.InstalledApp[]) {
    jest.spyOn(AppsStore, 'useApps').mockReturnValue({
      apps: [...dockApps, ...nonDockApps],
      homeApps: [],
      dockApps,
      nonDockApps,
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
    } as ReturnType<typeof AppsStore.useApps>);
  }

  it('does not render the app name text under a dock icon', () => {
    // Scoped to the dock icon's own subtree (`within`), not the whole tree:
    // `apps` also feeds the App Library page (#434), which lists every app —
    // including dock ones — by name regardless of this fix, so a global
    // queryByText would find that unrelated match and prove nothing about
    // the dock icon itself.
    mockApps([dockApp], [gridApp]);
    const { getByLabelText } = render(<LauncherHomeScreen />);

    const dockIcon = getByLabelText('Open DockOnlyApp');
    expect(dockIcon).toBeTruthy();
    expect(within(dockIcon).queryByText('DockOnlyApp')).toBeNull();
  });

  it('still renders the app name text under a home-grid icon (grid is unaffected)', () => {
    mockApps([dockApp], [gridApp]);
    const { getByLabelText } = render(<LauncherHomeScreen />);

    const gridIcon = getByLabelText('Open GridOnlyApp');
    expect(within(gridIcon).getByText('GridOnlyApp')).toBeTruthy();
  });

  it('keeps the dock icon accessible press target intact without a label', () => {
    mockApps([dockApp], [gridApp]);
    const { getByLabelText } = render(<LauncherHomeScreen />);
    const icon = getByLabelText('Open DockOnlyApp');
    expect(icon.props.accessibilityRole).toBe('button');
    expect(() => fireEvent.press(icon)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Focus filters — page visibility per Focus mode (#618)
// ---------------------------------------------------------------------------
// Um modo de Focus activo esconde as páginas cujo índice está em
// settings.focusPageVisibility[focusMode]. Os testes montam o LauncherHomeScreen
// real com apps suficientes para haver 2 páginas e afirmam sobre os testIDs
// `launcher-page-grid-N` e sobre os page dots (#603), que têm de refletir o
// número real de páginas visíveis.
describe('LauncherHomeScreen — Focus page visibility (#618)', () => {
  const FOCUS_APP_NAMES = Array.from({ length: 26 }, (_, i) => `FocusApp${i}`);

  function focusApp(name: string): AppsStore.InstalledApp {
    const pkg = `com.example.${name.toLowerCase()}`;
    return { name, packageName: pkg, icon: `file:///${pkg}.png`, isSystem: false };
  }

  function mockFocusApps(apps: AppsStore.InstalledApp[]) {
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
    } as ReturnType<typeof AppsStore.useApps>);
  }

  function seedSettings(partial: Record<string, unknown>) {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === '@iostoandroid/settings'
        ? Promise.resolve(JSON.stringify(partial))
        : Promise.resolve(null),
    );
  }

  /** Conta os page dots (#603): View 7x7 com borderRadius 3.5. */
  function countDots(root: ReturnType<typeof render>): number {
    return root.UNSAFE_getAllByType(RNView).filter((n: { props?: { style?: unknown } }) => {
      const s = StyleSheet.flatten(n.props?.style) as Record<string, unknown> | undefined;
      return !!s && s.width === 7 && s.height === 7 && s.borderRadius === 3.5;
    }).length;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hides a page whose index is listed for the active focus mode', async () => {
    // 26 apps reais + 14 virtuais = 40 itens; 4x6 = 24/página → 2 páginas.
    seedSettings({
      gridColumns: 4,
      gridRows: 6,
      focusMode: 'work',
      focusPageVisibility: { work: [1] },
    });
    mockFocusApps(FOCUS_APP_NAMES.map(focusApp));

    const root = render(<LauncherHomeScreen />);
    await waitFor(() => expect(root.getByTestId('launcher-page-grid-0')).toBeTruthy(), {
      timeout: 3000,
    });
    expect(root.queryByTestId('launcher-page-grid-1')).toBeNull();
    root.unmount();
  });

  it('shows every page when focusMode is off, even with entries stored', async () => {
    // O inverso do fix: a configuração existe mas 'off' não filtra nada.
    seedSettings({
      gridColumns: 4,
      gridRows: 6,
      focusMode: 'off',
      focusPageVisibility: { work: [1] },
    });
    mockFocusApps(FOCUS_APP_NAMES.map(focusApp));

    const root = render(<LauncherHomeScreen />);
    await waitFor(() => expect(root.getByTestId('launcher-page-grid-1')).toBeTruthy(), {
      timeout: 3000,
    });
    root.unmount();
  });

  it('ignores hidden pages configured for a DIFFERENT mode than the active one', async () => {
    seedSettings({
      gridColumns: 4,
      gridRows: 6,
      focusMode: 'sleep',
      focusPageVisibility: { work: [1] },
    });
    mockFocusApps(FOCUS_APP_NAMES.map(focusApp));

    const root = render(<LauncherHomeScreen />);
    await waitFor(() => expect(root.getByTestId('launcher-page-grid-1')).toBeTruthy(), {
      timeout: 3000,
    });
    root.unmount();
  });

  it('page dots reflect the real number of visible pages (#603 + #618)', async () => {
    // Sem filtro: 2 páginas + App Library = 3 dots. Com a página 1 oculta: 2.
    seedSettings({ gridColumns: 4, gridRows: 6, focusMode: 'off' });
    mockFocusApps(FOCUS_APP_NAMES.map(focusApp));
    const unfiltered = render(<LauncherHomeScreen />);
    await waitFor(() => expect(unfiltered.getByTestId('launcher-page-grid-1')).toBeTruthy(), {
      timeout: 3000,
    });
    const dotsWithAllPages = countDots(unfiltered);
    expect(dotsWithAllPages).toBe(3);
    unfiltered.unmount();

    seedSettings({
      gridColumns: 4,
      gridRows: 6,
      focusMode: 'work',
      focusPageVisibility: { work: [1] },
    });
    mockFocusApps(FOCUS_APP_NAMES.map(focusApp));
    const filtered = render(<LauncherHomeScreen />);
    await waitFor(() => expect(filtered.getByTestId('launcher-page-grid-0')).toBeTruthy(), {
      timeout: 3000,
    });
    expect(countDots(filtered)).toBe(dotsWithAllPages - 1);
    filtered.unmount();
  });

  it('keeps the first page visible when every page is hidden (no empty home)', async () => {
    seedSettings({
      gridColumns: 4,
      gridRows: 6,
      focusMode: 'work',
      focusPageVisibility: { work: [0, 1] },
    });
    mockFocusApps(FOCUS_APP_NAMES.map(focusApp));

    const root = render(<LauncherHomeScreen />);
    await waitFor(() => expect(root.getByTestId('launcher-page-grid-0')).toBeTruthy(), {
      timeout: 3000,
    });
    expect(root.queryByTestId('launcher-page-grid-1')).toBeNull();
    root.unmount();
  });

  it('survives a corrupted focusPageVisibility blob in AsyncStorage', async () => {
    // Inválido e hostil: valor não-array, índices negativos e strings.
    seedSettings({
      gridColumns: 4,
      gridRows: 6,
      focusMode: 'work',
      focusPageVisibility: { work: [-1, 'x', 1.5], sleep: 'nope' },
    });
    mockFocusApps(FOCUS_APP_NAMES.map(focusApp));

    const root = render(<LauncherHomeScreen />);
    // Nenhum índice válido → nada é escondido, e nada rebenta.
    await waitFor(() => expect(root.getByTestId('launcher-page-grid-1')).toBeTruthy(), {
      timeout: 3000,
    });
    root.unmount();
  });
});
