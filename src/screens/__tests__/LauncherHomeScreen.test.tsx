import React from 'react';
import { render } from '../../test-utils';
import { LauncherHomeScreen, NonAndroidFallback, computeWallpaperTranslateX, PARALLAX_OVERHANG } from '../LauncherHomeScreen';
import * as DeviceStore from '../../store/DeviceStore';
import * as AppsStore from '../../store/AppsStore';

function flattenStyle(style: unknown): Record<string, unknown>[] {
  if (Array.isArray(style)) return style.flat(Infinity).filter(Boolean) as Record<string, unknown>[];
  return style ? [style as Record<string, unknown>] : [];
}

describe('LauncherHomeScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<LauncherHomeScreen />);
    expect(toJSON()).toBeTruthy();
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
      launchApp: jest.fn(() => Promise.resolve()),
      addToHome: jest.fn(),
      removeFromHome: jest.fn(),
      addToDock: jest.fn(),
      removeFromDock: jest.fn(),
      removeFromRecents: jest.fn(),
      clearRecents: jest.fn(),
      isDefaultLauncher: true,
      openLauncherSettings: jest.fn(() => Promise.resolve()),
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
