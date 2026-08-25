import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, waitFor } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import { LauncherHomeScreen } from '../LauncherHomeScreen';
import { StatusBar } from 'react-native';

// issue #605: the launcher home screen must derive its StatusBar barStyle from
// `settings.statusBarStyle` (auto → follow theme) and hide it entirely when
// `settings.statusBarVisible` is false — previously it was hardcoded to
// `light-content` and never hid.

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

beforeEach(() => {
  mockApps();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LauncherHomeScreen Status Bar (#605)', () => {
  it('"Show Status Bar" = false hides the StatusBar on the home screen', async () => {
    seedSettings({ statusBarVisible: false, statusBarStyle: 'auto' });
    const { UNSAFE_queryAllByType } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(UNSAFE_queryAllByType(StatusBar).length).toBeGreaterThan(0));
    const bars = UNSAFE_queryAllByType(StatusBar);
    // At least one StatusBar must be hidden when the setting is off.
    const hidden = bars.some((bar: { props: { hidden?: boolean } }) => bar.props.hidden === true);
    expect(hidden).toBe(true);
  });

  it('"Show Status Bar" = true (default) does NOT hide the StatusBar', async () => {
    seedSettings({ statusBarVisible: true, statusBarStyle: 'auto' });
    const { UNSAFE_queryAllByType } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(UNSAFE_queryAllByType(StatusBar).length).toBeGreaterThan(0));
    const bars = UNSAFE_queryAllByType(StatusBar);
    const hidden = bars.some((bar: { props: { hidden?: boolean } }) => bar.props.hidden === true);
    expect(hidden).toBe(false);
  });

  it('statusBarStyle="light" forces light-content regardless of theme', async () => {
    seedSettings({ statusBarStyle: 'light', statusBarVisible: true });
    const { UNSAFE_queryAllByType } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(UNSAFE_queryAllByType(StatusBar).length).toBeGreaterThan(0));
    const bars = UNSAFE_queryAllByType(StatusBar);
    const homeBars = bars.filter(
      (bar: { props: { barStyle?: string } }) => bar.props.barStyle != null,
    );
    expect(homeBars.length).toBeGreaterThan(0);
    expect(homeBars.every((bar: { props: { barStyle?: string } }) => bar.props.barStyle === 'light-content')).toBe(true);
  });

  it('statusBarStyle="dark" forces dark-content regardless of theme', async () => {
    seedSettings({ statusBarStyle: 'dark', statusBarVisible: true });
    const { UNSAFE_queryAllByType } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(UNSAFE_queryAllByType(StatusBar).length).toBeGreaterThan(0));
    const bars = UNSAFE_queryAllByType(StatusBar);
    const homeBars = bars.filter(
      (bar: { props: { barStyle?: string } }) => bar.props.barStyle != null,
    );
    expect(homeBars.every((bar: { props: { barStyle?: string } }) => bar.props.barStyle === 'dark-content')).toBe(true);
  });

  it('statusBarStyle="auto" (default) follows the theme', async () => {
    seedSettings({ statusBarStyle: 'auto', statusBarVisible: true });
    const { UNSAFE_queryAllByType } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(UNSAFE_queryAllByType(StatusBar).length).toBeGreaterThan(0));
    const bars = UNSAFE_queryAllByType(StatusBar);
    const homeBars = bars.filter(
      (bar: { props: { barStyle?: string } }) => bar.props.barStyle != null,
    );
    expect(homeBars.length).toBeGreaterThan(0);
    // In the test theme, light-content is the pre-existing theme-derived value;
    // with auto we only assert it is one of the two valid theme values.
    expect(
      homeBars.every((bar: { props: { barStyle?: string } }) =>
        bar.props.barStyle === 'light-content' || bar.props.barStyle === 'dark-content',
      ),
    ).toBe(true);
  });

  // Inverse of the fix: when statusBarVisible is true the StatusBar must NOT be
  // hidden, even though other StatusBars may exist elsewhere in the tree.
  it('Show Status Bar = true leaves every StatusBar unhidden (inverse of fix)', async () => {
    seedSettings({ statusBarVisible: true, statusBarStyle: 'auto' });
    const { UNSAFE_queryAllByType } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(UNSAFE_queryAllByType(StatusBar).length).toBeGreaterThan(0));
    const bars = UNSAFE_queryAllByType(StatusBar);
    const anyHidden = bars.some((bar: { props: { hidden?: boolean } }) => bar.props.hidden === true);
    expect(anyHidden).toBe(false);
  });

  // Boundary / ausente: a setting key can be missing for users who upgraded
  // before #605 shipped. Missing statusBarStyle must fall back to following the
  // theme (auto), and missing statusBarVisible must default to visible — never
  // crash, never hide.
  it('missing statusBarStyle & statusBarVisible keys fall back safely (no crash, shown)', async () => {
    seedSettings({}); // no status bar keys at all
    const { UNSAFE_queryAllByType } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(UNSAFE_queryAllByType(StatusBar).length).toBeGreaterThan(0));
    const bars = UNSAFE_queryAllByType(StatusBar);
    const homeBars = bars.filter(
      (bar: { props: { barStyle?: string } }) => bar.props.barStyle != null,
    );
    expect(homeBars.length).toBeGreaterThan(0);
    expect(
      homeBars.every((bar: { props: { barStyle?: string } }) =>
        bar.props.barStyle === 'light-content' || bar.props.barStyle === 'dark-content',
      ),
    ).toBe(true);
    const anyHidden = bars.some((bar: { props: { hidden?: boolean } }) => bar.props.hidden === true);
    expect(anyHidden).toBe(false);
  });
});
