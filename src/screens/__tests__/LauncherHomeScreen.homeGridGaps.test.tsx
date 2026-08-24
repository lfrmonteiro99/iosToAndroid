import React from 'react';
import { render, waitFor } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import * as FoldersStore from '../../store/FoldersStore';
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

function mockFolders(folders: FoldersStore.AppFolder[]) {
  jest.spyOn(FoldersStore, 'useFolders').mockReturnValue({
    folders,
    createFolder: jest.fn(),
    renameFolder: jest.fn(),
    addToFolder: jest.fn(),
    removeFromFolder: jest.fn(),
    deleteFolder: jest.fn(),
    getFolderForApp: jest.fn((pkg: string) => folders.find(f => f.apps.includes(pkg))),
    isReady: true,
  } as ReturnType<typeof FoldersStore.useFolders>);
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

  // ── A position claimed by an entry that never renders in the grid is NOT a
  // hole. `assignHomePositions` numbers the FULL scan (dock apps, folder
  // members, built-in duplicates, hidden/library-only apps all get a
  // position), so treating "no eligible app here" as a hole invented a blank
  // cell for every one of them — on a clean install that is every user.
  it('skips a position claimed by a non-eligible entry (folder member / dock / built-in duplicate) instead of emptying it', () => {
    const items = layoutHomeAppsWithGaps(
      [apple, cherry],
      [
        { packageName: 'com.example.apple', position: 0 },
        { packageName: 'com.example.banana', position: 1 }, // not in eligibleApps
        { packageName: 'com.example.cherry', position: 2 },
      ],
    );
    expect(items).toEqual([
      { type: 'app', app: apple },
      { type: 'app', app: cherry },
    ]);
  });

  it('distinguishes a real hole (no entry at all) from a non-eligible entry in the same layout', () => {
    // position 1 → entry exists but package is not eligible → skipped.
    // position 2 → no entry whatsoever (removeFromHome deleted it) → hole.
    const items = layoutHomeAppsWithGaps(
      [apple, cherry],
      [
        { packageName: 'com.example.apple', position: 0 },
        { packageName: 'com.example.banana', position: 1 },
        { packageName: 'com.example.cherry', position: 3 },
      ],
    );
    expect(items).toEqual([
      { type: 'app', app: apple },
      { type: 'empty', key: 'empty-2' },
      { type: 'app', app: cherry },
    ]);
  });

  it('does not pad past the last eligible app when non-eligible entries hold higher positions', () => {
    const items = layoutHomeAppsWithGaps(
      [apple],
      [
        { packageName: 'com.example.apple', position: 0 },
        { packageName: 'com.example.banana', position: 4 },
        { packageName: 'com.example.cherry', position: 9 },
      ],
    );
    expect(items).toEqual([{ type: 'app', app: apple }]);
  });

  it('an app with no entry is appended past every recorded position, never on top of a non-eligible one', () => {
    const items = layoutHomeAppsWithGaps(
      [apple, cherry],
      [
        { packageName: 'com.example.apple', position: 0 },
        { packageName: 'com.example.banana', position: 1 },
      ],
    );
    // cherry has no entry: it goes after position 1 (banana's), and banana's
    // own position must not become an empty slot.
    expect(items).toEqual([
      { type: 'app', app: apple },
      { type: 'app', app: cherry },
    ]);
  });

  it('a layout whose positions are all consecutive and all claimed produces no empty slot at all (post Compact Layout)', () => {
    const items = layoutHomeAppsWithGaps(
      [apple, cherry],
      [
        { packageName: 'com.example.apple', position: 0 },
        { packageName: 'com.example.banana', position: 1 },
        { packageName: 'com.example.cherry', position: 2 },
      ],
    );
    expect(items.some(i => i.type === 'empty')).toBe(false);
  });

  it('empty eligibleApps yields no items, however many entries homeApps holds', () => {
    expect(
      layoutHomeAppsWithGaps([], [
        { packageName: 'com.example.apple', position: 0 },
        { packageName: 'com.example.banana', position: 7 },
      ]),
    ).toEqual([]);
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

  it('an app that lives inside a folder holds a position but leaves no blank cell in the grid', async () => {
    const alpha = { name: 'Alpha', packageName: 'com.example.alpha', icon: '', isSystem: false };
    const beta = { name: 'Beta', packageName: 'com.example.beta', icon: '', isSystem: false };
    const gamma = { name: 'Gamma', packageName: 'com.example.gamma', icon: '', isSystem: false };
    mockFolders([{ id: 'f1', name: 'Stuff', apps: ['com.example.beta'], color: '#888888' }]);
    mockApps({
      nonDockApps: [alpha, beta, gamma],
      apps: [alpha, beta, gamma],
      homeApps: [
        { packageName: 'com.example.alpha', position: 0 },
        { packageName: 'com.example.beta', position: 1 },
        { packageName: 'com.example.gamma', position: 2 },
      ],
    });

    const { getByTestId, queryByTestId } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByTestId('app-icon-box-com.example.alpha')).toBeTruthy(), { timeout: 3000 });
    // beta renders inside the folder, never as a grid icon...
    expect(queryByTestId('app-icon-box-com.example.beta')).toBeNull();
    // ...and its position must NOT materialise as a blank cell.
    expect(queryByTestId('grid-empty-slot-empty-1')).toBeNull();
    // The folder itself stays contiguous, as before this feature.
    expect(getByTestId('folder-icon-box-f1')).toBeTruthy();
    expect(getByTestId('app-icon-box-com.example.gamma')).toBeTruthy();
  });

  it('an Android duplicate of a built-in app holds a position but leaves no blank cell (clean-install case)', async () => {
    const alpha = { name: 'Alpha', packageName: 'com.example.alpha', icon: '', isSystem: false };
    const dialer = { name: 'Phone', packageName: 'com.google.android.dialer', icon: '', isSystem: true };
    const gamma = { name: 'Gamma', packageName: 'com.example.gamma', icon: '', isSystem: false };
    mockApps({
      nonDockApps: [alpha, dialer, gamma],
      apps: [alpha, dialer, gamma],
      homeApps: [
        { packageName: 'com.example.alpha', position: 0 },
        { packageName: 'com.google.android.dialer', position: 1 },
        { packageName: 'com.example.gamma', position: 2 },
      ],
    });

    const { getByTestId, queryByTestId } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByTestId('app-icon-box-com.example.alpha')).toBeTruthy(), { timeout: 3000 });
    // #438 keeps the duplicate out of the grid...
    expect(queryByTestId('app-icon-box-com.google.android.dialer')).toBeNull();
    // ...so its position is skipped, not turned into a hole.
    expect(queryByTestId('grid-empty-slot-empty-1')).toBeNull();
    expect(getByTestId('app-icon-box-com.example.gamma')).toBeTruthy();
  });

  it('a dock app holds a position but leaves no blank cell in the grid', async () => {
    const alpha = { name: 'Alpha', packageName: 'com.example.alpha', icon: '', isSystem: false };
    const beta = { name: 'Beta', packageName: 'com.example.beta', icon: '', isSystem: false };
    mockApps({
      nonDockApps: [alpha],
      dockApps: [beta],
      apps: [alpha, beta],
      homeApps: [
        { packageName: 'com.example.beta', position: 0 },
        { packageName: 'com.example.alpha', position: 1 },
      ],
    });

    const { getByTestId, queryByTestId } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByTestId('app-icon-box-com.example.alpha')).toBeTruthy(), { timeout: 3000 });
    expect(queryByTestId('grid-empty-slot-empty-0')).toBeNull();
  });

  it('after Compact Layout renumbers every entry 0..n-1, the grid has no empty slot even with non-eligible entries', async () => {
    const alpha = { name: 'Alpha', packageName: 'com.example.alpha', icon: '', isSystem: false };
    const dialer = { name: 'Phone', packageName: 'com.google.android.dialer', icon: '', isSystem: true };
    const gamma = { name: 'Gamma', packageName: 'com.example.gamma', icon: '', isSystem: false };
    // Exactly what compactHomeLayout produces from a holed layout that also
    // contains a built-in duplicate: 0..n-1, no gaps, duplicate included.
    mockApps({
      nonDockApps: [alpha, dialer, gamma],
      apps: [alpha, dialer, gamma],
      homeApps: [
        { packageName: 'com.example.alpha', position: 0 },
        { packageName: 'com.google.android.dialer', position: 1 },
        { packageName: 'com.example.gamma', position: 2 },
      ],
    });

    const { getByTestId, queryAllByTestId } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByTestId('app-icon-box-com.example.alpha')).toBeTruthy(), { timeout: 3000 });
    expect(queryAllByTestId(/^grid-empty-slot-/)).toHaveLength(0);
  });
});
