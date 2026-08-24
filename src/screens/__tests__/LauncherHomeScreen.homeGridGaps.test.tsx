import React from 'react';
import { render, waitFor } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import { LauncherHomeScreen, layoutHomeAppsWithGaps } from '../LauncherHomeScreen';

// #762: removing an app (or, eventually, dragging one) no longer recompacts
// homeApps[].position — the grid must render the hole instead of pulling the
// next app up into it. layoutHomeAppsWithGaps is the pure function that
// decides this; the render test below proves it is actually wired into the
// screen, not just correct in isolation.

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

beforeEach(() => {
  mockApps();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('layoutHomeAppsWithGaps (#762 — pure layout function)', () => {
  const apple = { name: 'Apple', packageName: 'com.example.apple', icon: '', isSystem: false };
  const banana = { name: 'Banana', packageName: 'com.example.banana', icon: '', isSystem: false };
  const cherry = { name: 'Cherry', packageName: 'com.example.cherry', icon: '', isSystem: false };

  it('renders an empty slot at a position nobody claims, instead of pulling the next app up', () => {
    const items = layoutHomeAppsWithGaps(
      [apple, cherry],
      [
        { packageName: 'com.example.apple', position: 0 },
        { packageName: 'com.example.cherry', position: 2 },
      ],
    );
    expect(items).toEqual([
      { type: 'app', app: apple },
      { type: 'empty', key: 'empty-1' },
      { type: 'app', app: cherry },
    ]);
  });

  it('appends an app with no homeApps entry right after the highest known position', () => {
    const items = layoutHomeAppsWithGaps(
      [apple, banana, cherry],
      [{ packageName: 'com.example.apple', position: 0 }],
    );
    // banana/cherry have no explicit position — appended in their existing
    // (eligibleApps) order, contiguous, right after position 0.
    expect(items).toEqual([
      { type: 'app', app: apple },
      { type: 'app', app: banana },
      { type: 'app', app: cherry },
    ]);
  });

  it('with no homeApps entries at all, behaves exactly like today (contiguous, in nonDockApps order)', () => {
    const items = layoutHomeAppsWithGaps([apple, banana, cherry], []);
    expect(items).toEqual([
      { type: 'app', app: apple },
      { type: 'app', app: banana },
      { type: 'app', app: cherry },
    ]);
  });

  it('never leaves a trailing empty slot past the last real app (a hole at the end never spawns an extra blank page)', () => {
    // positions 0 and 3 are claimed; 1 and 2 are holes; there is nothing
    // beyond 3 — the array must stop at index 3, not pad further.
    const items = layoutHomeAppsWithGaps(
      [apple, banana],
      [
        { packageName: 'com.example.apple', position: 0 },
        { packageName: 'com.example.banana', position: 3 },
      ],
    );
    expect(items).toHaveLength(4);
    expect(items[items.length - 1]).toEqual({ type: 'app', app: banana });
  });

  it('a hole at position 0 (removing the very first home app) is preserved, not shifted', () => {
    const items = layoutHomeAppsWithGaps(
      [banana],
      [{ packageName: 'com.example.banana', position: 1 }],
    );
    expect(items).toEqual([
      { type: 'empty', key: 'empty-0' },
      { type: 'app', app: banana },
    ]);
  });
});

describe('LauncherHomeScreen — home grid renders holes (#762)', () => {
  it('a homeApps gap renders a blank cell in the real DOM, and the following app keeps its own slot instead of sliding into the hole', async () => {
    const apple = { name: 'Apple', packageName: 'com.example.apple', icon: '', isSystem: false };
    const cherry = { name: 'Cherry', packageName: 'com.example.cherry', icon: '', isSystem: false };
    mockApps({
      nonDockApps: [apple, cherry],
      homeApps: [
        { packageName: 'com.example.apple', position: 0 },
        { packageName: 'com.example.cherry', position: 2 },
      ],
    });

    const { getByTestId } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByTestId('app-icon-box-com.example.apple')).toBeTruthy(), { timeout: 3000 });
    // The empty slot at position 1 is a real, present cell...
    expect(getByTestId('grid-empty-slot-empty-1')).toBeTruthy();
    // ...and cherry is still rendered as its own icon (not merged/skipped),
    // so nothing "pulled it up" into the hole.
    expect(getByTestId('app-icon-box-com.example.cherry')).toBeTruthy();
  });
});
