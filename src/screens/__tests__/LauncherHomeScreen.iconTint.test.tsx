import React from 'react';
import { render } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import * as SettingsStore from '../../store/SettingsStore';
import { LauncherHomeScreen } from '../LauncherHomeScreen';

// issue #620: «Tinted Icons» — when enabled, real app-icon Images on the
// home grid and dock render with the chosen colour as tintColor. Mirrors the
// mocking pattern used by LauncherHomeScreen.wallpaperIndex.test.tsx.

function withSettings(overrides: Partial<SettingsStore.SettingsState>) {
  jest.spyOn(SettingsStore, 'useSettings').mockReturnValue({
    settings: { ...SettingsStore.DEFAULT_SETTINGS, ...overrides },
    update: jest.fn(),
    updateMany: jest.fn(),
    reset: jest.fn(),
    syncFromDevice: jest.fn(() => Promise.resolve()),
    isReady: true,
    activeFocusMode: null,
    setFocusMode: jest.fn(),
  } as unknown as ReturnType<typeof SettingsStore.useSettings>);
}

const realApp = (name: string, packageName: string): AppsStore.InstalledApp => ({
  name,
  packageName,
  icon: 'content://icons/one.png',
  isSystem: false,
});

function mockApps(overrides: Record<string, unknown> = {}) {
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps: [], homeApps: [], dockApps: [], nonDockApps: [], recentPackages: [], recentApps: [],
    isLoading: false, refreshApps: jest.fn(() => Promise.resolve()), launchApp: jest.fn(() => Promise.resolve(true)),
    addToHome: jest.fn(), removeFromHome: jest.fn(), addToDock: jest.fn(), removeFromDock: jest.fn(),
    removeFromRecents: jest.fn(), clearRecents: jest.fn(), isDefaultLauncher: true,
    openLauncherSettings: jest.fn(() => Promise.resolve()), hiddenApps: [], visibleApps: [],
    hideApp: jest.fn(), unhideApp: jest.fn(), iconCacheSizeBytes: 0, isRebuildingIconCache: false,
    iconCacheRebuildProgress: null, rebuildIconCache: jest.fn(() => Promise.resolve()),
    ...overrides,
  } as ReturnType<typeof AppsStore.useApps>);
}

function flattenStyle(style: unknown): Record<string, unknown>[] {
  if (Array.isArray(style)) return style.flat(Infinity).filter(Boolean) as Record<string, unknown>[];
  return style ? [style as Record<string, unknown>] : [];
}

describe('LauncherHomeScreen — Tinted Icons (#620)', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('applies no tintColor to a grid app icon when iconTintEnabled is false (default)', () => {
    const app = realApp('Chess Deluxe', 'com.example.chess');
    mockApps({ homeApps: [app], nonDockApps: [app], dockApps: [] });
    withSettings({ iconTintEnabled: false, iconTintColor: '#FF3B30' });

    const { getByTestId } = render(<LauncherHomeScreen />);
    const image = getByTestId('app-icon-box-com.example.chess');
    const flat = flattenStyle(image.props.style);

    expect(flat.some((s) => 'tintColor' in s)).toBe(false);
    expect(image.props.tintColor).toBeUndefined();
  });

  it('applies iconTintColor as tintColor to a grid app icon when iconTintEnabled is true', () => {
    const app = realApp('Chess Deluxe', 'com.example.chess');
    mockApps({ homeApps: [app], nonDockApps: [app], dockApps: [] });
    withSettings({ iconTintEnabled: true, iconTintColor: '#FF3B30' });

    const { getByTestId } = render(<LauncherHomeScreen />);
    const image = getByTestId('app-icon-box-com.example.chess');
    const flat = flattenStyle(image.props.style);

    expect(flat.find((s) => 'tintColor' in s)).toEqual({ tintColor: '#FF3B30' });
    expect(image.props.tintColor).toBe('#FF3B30');
  });

  it('also tints the dock icon with the same colour (dock reuses AppIcon)', () => {
    const app = realApp('Phone', 'com.example.phone');
    mockApps({ dockApps: [app], nonDockApps: [], homeApps: [] });
    withSettings({ iconTintEnabled: true, iconTintColor: '#34C759' });

    const { getByTestId } = render(<LauncherHomeScreen />);
    const image = getByTestId('app-icon-box-com.example.phone');
    expect(image.props.tintColor).toBe('#34C759');
  });

  it('does not tint the app-name label — only the icon (combines with showIconLabels)', () => {
    const app = realApp('Chess Deluxe', 'com.example.chess');
    mockApps({ homeApps: [app], nonDockApps: [app], dockApps: [] });
    withSettings({ iconTintEnabled: true, iconTintColor: '#FF3B30', showIconLabels: true });

    const { getByText } = render(<LauncherHomeScreen />);
    const label = getByText('Chess Deluxe');
    const flat = flattenStyle(label.props.style);
    expect(flat.some((s) => 'tintColor' in s || 'color' in s && s.color === '#FF3B30')).toBe(false);
  });

  it('keeps icon dimensions unchanged across a smaller grid density (adaptive-icon safety, #503 geometry)', () => {
    const app = realApp('Chess Deluxe', 'com.example.chess');
    mockApps({ homeApps: [app], nonDockApps: [app], dockApps: [] });

    withSettings({ iconTintEnabled: false, gridColumns: 4 });
    const untinted = render(<LauncherHomeScreen />);
    const untintedImage = untinted.getByTestId('app-icon-box-com.example.chess');
    const untintedSize = flattenStyle(untintedImage.props.style).find((s) => 'width' in s);
    untinted.unmount();

    withSettings({ iconTintEnabled: true, iconTintColor: '#AF52DE', gridColumns: 6 });
    const tinted = render(<LauncherHomeScreen />);
    const tintedImage = tinted.getByTestId('app-icon-box-com.example.chess');
    const tintedSize = flattenStyle(tintedImage.props.style).find((s) => 'width' in s);

    // gridColumns changed (4 -> 6), so the two sizes are expected to differ,
    // but the tint must never leave width/height undefined or NaN — a
    // corrupted box size is exactly how an adaptive icon would visibly break.
    expect(typeof (untintedSize as { width: number }).width).toBe('number');
    expect(typeof (tintedSize as { width: number }).width).toBe('number');
    expect(Number.isNaN((tintedSize as { width: number }).width)).toBe(false);
  });
});
