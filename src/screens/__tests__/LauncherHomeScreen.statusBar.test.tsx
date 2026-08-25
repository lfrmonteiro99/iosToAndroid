import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar, Text } from 'react-native';
import { render, waitFor } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import { LauncherHomeScreen } from '../LauncherHomeScreen';

// Reported from a device: "there is a lot of space between the top and where
// the icons start", and pressing the banner's "Set Now" does not remove it.
//
// The cause was this screen showing TWO status bars. #605 wired
// `settings.statusBarVisible` to Android's system status bar and made it
// visible by default — while the launcher goes on drawing its own iOS status
// row (time, wifi, battery) unconditionally underneath. App.tsx hides the
// system bars globally for exactly this reason; this screen was the one place
// that turned them back on, and the result was Android's bar stacked on top of
// ours before a single icon.
//
// The contract this suite pins is therefore the inverse of #605's:
//
//   - Android's status bar is ALWAYS hidden here. The launcher owns the screen.
//   - `statusBarVisible` gates the launcher's OWN row, which is what the "Show
//     Status Bar" toggle sits beside in Launcher Settings ("Show Page Dots",
//     "Show App Names") — all of them launcher chrome, none of them Android's.
//   - `statusBarStyle` tints that row, so the setting keeps meaning instead of
//     becoming dead once it no longer has an Android bar to style.
//   - Whichever element comes first clears the notch, and something always
//     does, even with the banner and the row both gone.

function mockApps(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  } as ReturnType<typeof AppsStore.useApps>);
}

function seedSettings(partial: Record<string, unknown>) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    key === '@iostoandroid/settings'
      ? Promise.resolve(JSON.stringify(partial))
      : Promise.resolve(null),
  );
}

/** Flattens a style prop (array, nested arrays, or object) into one object. */
function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return (style ?? {}) as Record<string, unknown>;
}

beforeEach(() => {
  mockApps();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Android's status bar on the launcher", () => {
  it('is hidden — the launcher draws its own, and two of them was the reported gap', async () => {
    seedSettings({ statusBarVisible: true, statusBarStyle: 'auto' });
    const { UNSAFE_queryAllByType } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(UNSAFE_queryAllByType(StatusBar).length).toBeGreaterThan(0));
    const bars = UNSAFE_queryAllByType(StatusBar);
    expect(bars.every((bar: { props: { hidden?: boolean } }) => bar.props.hidden === true)).toBe(true);
  });

  it('stays hidden with "Show Status Bar" off as well', async () => {
    // Off must not mean "show Android's instead".
    seedSettings({ statusBarVisible: false, statusBarStyle: 'auto' });
    const { UNSAFE_queryAllByType } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(UNSAFE_queryAllByType(StatusBar).length).toBeGreaterThan(0));
    const bars = UNSAFE_queryAllByType(StatusBar);
    expect(bars.every((bar: { props: { hidden?: boolean } }) => bar.props.hidden === true)).toBe(true);
  });

  it('is translucent over a transparent background, so the wallpaper reaches the top', async () => {
    seedSettings({});
    const { UNSAFE_queryAllByType } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(UNSAFE_queryAllByType(StatusBar).length).toBeGreaterThan(0));
    const bar = UNSAFE_queryAllByType(StatusBar)[0] as {
      props: { translucent?: boolean; backgroundColor?: string };
    };
    expect(bar.props.translucent).toBe(true);
    expect(bar.props.backgroundColor).toBe('transparent');
  });
});

describe('"Show Status Bar" gates the launcher\'s own row', () => {
  it('shows the row when on (the default)', async () => {
    seedSettings({ statusBarVisible: true });
    const { queryByTestId } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(queryByTestId('launcher-status-row')).toBeTruthy());
  });

  it('removes the row when off', async () => {
    // Previously the toggle hid Android's bar and left ours in place, which is
    // the opposite of what a launcher-appearance switch should do.
    seedSettings({ statusBarVisible: false });
    const { queryByTestId } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(queryByTestId('launcher-top-clearance')).toBeTruthy());
    expect(queryByTestId('launcher-status-row')).toBeNull();
  });

  it('defaults to shown when the key is missing (upgrade from before the toggle)', async () => {
    seedSettings({});
    const { queryByTestId } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(queryByTestId('launcher-status-row')).toBeTruthy());
  });
});

describe('statusBarStyle tints the launcher\'s own row', () => {
  /** The clock inside the status row. */
  function clockColour(row: { props: { children?: unknown } }) {
    // The row's first child is the clock Pressable wrapping one Text.
    const texts: { props: { style?: unknown } }[] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      const el = node as { type?: unknown; props?: { children?: unknown; style?: unknown } };
      if (!el || typeof el !== 'object') return;
      if (el.type === Text) texts.push(el as { props: { style?: unknown } });
      if (el.props?.children) walk(el.props.children);
    };
    walk(row.props.children);
    return flatten(texts[0]?.props.style).color;
  }

  it('is white by default', async () => {
    seedSettings({ statusBarStyle: 'auto' });
    const { getByTestId } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByTestId('launcher-status-row')).toBeTruthy());
    expect(clockColour(getByTestId('launcher-status-row'))).toBe('#FFFFFF');
  });

  it('is white when explicitly light', async () => {
    seedSettings({ statusBarStyle: 'light' });
    const { getByTestId } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByTestId('launcher-status-row')).toBeTruthy());
    expect(clockColour(getByTestId('launcher-status-row'))).toBe('#FFFFFF');
  });

  it('is black when dark', async () => {
    seedSettings({ statusBarStyle: 'dark' });
    const { getByTestId } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByTestId('launcher-status-row')).toBeTruthy());
    expect(clockColour(getByTestId('launcher-status-row'))).toBe('#000000');
  });

  it('stays white on "auto" rather than following the theme', async () => {
    // The row sits on the WALLPAPER, not on the theme background, so a light
    // theme must not turn it black and risk making it invisible.
    seedSettings({ statusBarStyle: 'auto', theme: 'light' });
    const { getByTestId } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByTestId('launcher-status-row')).toBeTruthy());
    expect(clockColour(getByTestId('launcher-status-row'))).toBe('#FFFFFF');
  });
});

describe('top clearance for the notch', () => {
  it('the status row carries it when the banner is not showing', async () => {
    seedSettings({ statusBarVisible: true });
    const { getByTestId } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByTestId('launcher-status-row')).toBeTruthy());
    // 24 is the floor the screen applies when neither the safe-area inset nor
    // StatusBar.currentHeight reports anything, plus the row's own 4.
    expect(flatten(getByTestId('launcher-status-row').props.style).marginTop as number).toBeGreaterThanOrEqual(28);
  });

  it('the banner carries it instead when the banner IS showing', async () => {
    // Two elements both paying for the cutout would double the gap; the row
    // drops to its own 4dp.
    mockApps({ isDefaultLauncher: false });
    seedSettings({ statusBarVisible: true });
    const { getByTestId } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByTestId('launcher-default-banner')).toBeTruthy());

    expect(flatten(getByTestId('launcher-default-banner').props.style).marginTop as number).toBeGreaterThanOrEqual(24);
    expect(flatten(getByTestId('launcher-status-row').props.style).marginTop).toBe(4);
  });

  it('the banner and the row never both pay for it', async () => {
    // The regression this replaces: the banner used the raw safe-area inset and
    // the row used max(inset, StatusBar.currentHeight, 24), so the two
    // disagreed about where the top of the screen was.
    mockApps({ isDefaultLauncher: false });
    seedSettings({ statusBarVisible: true });
    const { getByTestId } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByTestId('launcher-default-banner')).toBeTruthy());

    const banner = flatten(getByTestId('launcher-default-banner').props.style).marginTop as number;
    const row = flatten(getByTestId('launcher-status-row').props.style).marginTop as number;
    expect(Math.min(banner, row)).toBeLessThan(24);
  });

  it('a spacer carries it when neither the banner nor the row is on screen', async () => {
    // Otherwise the first row of icons starts under the camera cutout.
    seedSettings({ statusBarVisible: false });
    const { getByTestId } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByTestId('launcher-top-clearance')).toBeTruthy());
    expect(flatten(getByTestId('launcher-top-clearance').props.style).height as number).toBeGreaterThanOrEqual(24);
  });

  it('no spacer when the row is already there — it would be a second gap', async () => {
    seedSettings({ statusBarVisible: true });
    const { queryByTestId, getByTestId } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByTestId('launcher-status-row')).toBeTruthy());
    expect(queryByTestId('launcher-top-clearance')).toBeNull();
  });

  it('no spacer when only the banner is there', async () => {
    mockApps({ isDefaultLauncher: false });
    seedSettings({ statusBarVisible: false });
    const { queryByTestId, getByTestId } = render(<LauncherHomeScreen />);
    await waitFor(() => expect(getByTestId('launcher-default-banner')).toBeTruthy());
    expect(queryByTestId('launcher-top-clearance')).toBeNull();
  });
});
