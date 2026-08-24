import React from 'react';
import { render, fireEvent, act } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import { AppLibraryContent } from '../AppLibraryScreen';
import { SpotlightSearchScreen } from '../SpotlightSearchScreen';
import type { AppNavigationProp } from '../../navigation/types';

// #701: tapping "Photos" in the App Library started Google Photos instead of
// our own photo library. The Android duplicates of our built-ins
// (BUILT_IN_APP_ANDROID_ALIASES, #438) were only resolved to an internal route
// by the home grid; the App Library and Spotlight called launchApp() for every
// row, so the real Google package went out through the Android intent — and the
// row's label is "Photos", so the user has no way to tell them apart.
//
// These tests mount the REAL screens and press the REAL rows; only the apps
// store is mocked (same pattern as LauncherHomeScreen.entryPoints.test.tsx),
// because the routing decision under test lives in the screens.

const GOOGLE_PHOTOS: AppsStore.InstalledApp = {
  name: 'Photos', packageName: 'com.google.android.apps.photos', icon: '', isSystem: false,
};
const GOOGLE_CLOCK: AppsStore.InstalledApp = {
  name: 'Clock', packageName: 'com.google.android.deskclock', icon: '', isSystem: false,
};
const SPOTIFY: AppsStore.InstalledApp = {
  name: 'Spotify', packageName: 'com.spotify', icon: '', isSystem: false,
};

const ALL_APPS = [GOOGLE_PHOTOS, GOOGLE_CLOCK, SPOTIFY];

const mockLaunchApp = jest.fn(() => Promise.resolve(true));

function mockApps(apps: AppsStore.InstalledApp[] = ALL_APPS) {
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps,
    homeApps: [],
    dockApps: [],
    nonDockApps: apps,
    libraryOnlyApps: [],
    hiddenApps: [],
    visibleApps: apps,
    recentPackages: [],
    recentApps: [],
    isLoading: false,
    refreshApps: jest.fn(() => Promise.resolve()),
    launchApp: mockLaunchApp,
    addToHome: jest.fn(),
    removeFromHome: jest.fn(),
    hideApp: jest.fn(),
    unhideApp: jest.fn(),
    addToDock: jest.fn(),
    removeFromDock: jest.fn(),
    removeFromRecents: jest.fn(),
    clearRecents: jest.fn(),
    isDefaultLauncher: true,
    openLauncherSettings: jest.fn(() => Promise.resolve()),
    iconCacheSizeBytes: 0,
    isRebuildingIconCache: false,
    iconCacheRebuildProgress: null,
    rebuildIconCache: jest.fn(() => Promise.resolve()),
  } as unknown as ReturnType<typeof AppsStore.useApps>);
}

function makeNav() {
  return { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as unknown as AppNavigationProp;
}

beforeEach(() => {
  mockLaunchApp.mockClear();
  mockApps();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('App Library — Android duplicates of built-ins open our screen (#701)', () => {
  function renderLibrary(nav: AppNavigationProp, query: string) {
    const utils = render(<AppLibraryContent navigation={nav} />);
    fireEvent.changeText(utils.getByPlaceholderText('Search'), query);
    return utils;
  }

  function pressRow(utils: ReturnType<typeof render>, name: string) {
    const rows = utils.getAllByLabelText(`Open ${name}, App Library`);
    fireEvent.press(rows[rows.length - 1]);
    return rows[rows.length - 1];
  }

  it('tapping Photos opens the internal Photos screen instead of launching Google Photos', () => {
    const nav = makeNav();
    const utils = renderLibrary(nav, 'Photos');
    pressRow(utils, 'Photos');

    expect(nav.navigate).toHaveBeenCalledWith('Photos');
    expect(mockLaunchApp).not.toHaveBeenCalled();
  });

  it('resolves every listed alias, not just Photos (Google Clock → internal Clock)', () => {
    const nav = makeNav();
    const utils = renderLibrary(nav, 'Clock');
    pressRow(utils, 'Clock');

    expect(nav.navigate).toHaveBeenCalledWith('Clock');
    expect(mockLaunchApp).not.toHaveBeenCalled();
  });

  it('the inverse of the fix: a third-party app still launches externally', () => {
    const nav = makeNav();
    const utils = renderLibrary(nav, 'Spotify');
    pressRow(utils, 'Spotify');

    expect(mockLaunchApp).toHaveBeenCalledWith('com.spotify');
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('a double tap routes internally twice and never falls through to launchApp', () => {
    const nav = makeNav();
    const utils = renderLibrary(nav, 'Photos');
    const row = pressRow(utils, 'Photos');
    fireEvent.press(row);

    expect(nav.navigate).toHaveBeenCalledTimes(2);
    expect(nav.navigate).toHaveBeenNthCalledWith(1, 'Photos');
    expect(nav.navigate).toHaveBeenNthCalledWith(2, 'Photos');
    expect(mockLaunchApp).not.toHaveBeenCalled();
  });

  it('an app whose packageName is missing does not crash the row and stays external', () => {
    // Payload nativo corrompido (#696/#699/#704): resolveInternalRoute recebe
    // undefined e tem de devolver undefined em vez de rebentar.
    mockApps([{ name: 'Broken', packageName: undefined, icon: '', isSystem: false } as unknown as AppsStore.InstalledApp]);
    const nav = makeNav();
    const utils = renderLibrary(nav, 'Broken');
    expect(() => pressRow(utils, 'Broken')).not.toThrow();
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('without a navigation prop the row degrades to the external launch instead of crashing', () => {
    // AppLibraryContent is also rendered as the last page of the home pager
    // (#434). If a call site ever forgets to pass navigation, the row must
    // still do something instead of throwing on `navigation.navigate`.
    const utils = render(<AppLibraryContent />);
    fireEvent.changeText(utils.getByPlaceholderText('Search'), 'Photos');
    const rows = utils.getAllByLabelText('Open Photos, App Library');
    expect(() => fireEvent.press(rows[rows.length - 1])).not.toThrow();
    expect(mockLaunchApp).toHaveBeenCalledWith('com.google.android.apps.photos');
  });
});

describe('Spotlight — Android duplicates of built-ins open our screen (#701)', () => {
  function renderSpotlight(nav: AppNavigationProp, query: string) {
    const utils = render(<SpotlightSearchScreen navigation={nav} />);
    fireEvent.changeText(utils.getByPlaceholderText('Search'), query);
    return utils;
  }

  it('tapping the Photos result navigates to the internal Photos screen', async () => {
    const nav = makeNav();
    const utils = renderSpotlight(nav, 'Photos');
    await act(async () => {
      fireEvent.press(utils.getAllByLabelText('Photos')[0]);
    });

    expect(nav.navigate).toHaveBeenCalledWith('Photos');
    expect(mockLaunchApp).not.toHaveBeenCalled();
  });

  it('the inverse of the fix: a third-party result still launches externally', async () => {
    const nav = makeNav();
    const utils = renderSpotlight(nav, 'Spotify');
    await act(async () => {
      fireEvent.press(utils.getAllByLabelText('Spotify')[0]);
    });

    expect(mockLaunchApp).toHaveBeenCalledWith('com.spotify');
    expect(nav.navigate).not.toHaveBeenCalled();
  });
});
