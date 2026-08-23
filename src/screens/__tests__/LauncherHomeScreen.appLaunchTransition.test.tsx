import React from 'react';
import * as Reanimated from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import MockNativeMethods from 'react-native/jest/MockNativeMethods';
import { render, fireEvent, act } from '../../test-utils';
import { LauncherHomeScreen } from '../LauncherHomeScreen';
import * as AppsStore from '../../store/AppsStore';
import * as GestureReduceMotionModule from '../../utils/useGestureReduceMotion';
import * as SettingsStore from '../../store/SettingsStore';
import { DEFAULT_SETTINGS } from '../../store/SettingsStore';

// #509 §6.3: tapping an app icon must expand it to full screen from the icon's
// own on-screen position, fire the real launch exactly when that expand spring
// settles (not on a fixed timer), suppress it under reduceMotion, and never get
// stuck full-screen if the launch fails or the icon's bounds never arrive.
//
// The expand spring itself is `withSpring` from `react-native-reanimated`,
// which jest.setup.js stubs to `identity` (drops the completion callback
// entirely) — the same limitation this repo's own
// `reanimated-jest-animation-target-testing` note documents. Spying on the
// named export (already the pattern in CupertinoSegmentedControl's suite) and
// making the callback fire synchronously lets these tests observe the real
// wiring instead of reimplementing it.
//
// Icon bounds come from `View#measureInWindow`, which RN's own jest preset
// (`react-native/jest/MockNativeMethods`) backs with a *shared* `jest.fn()` —
// overriding its implementation here delivers fake bounds through the exact
// ref call AppIcon makes in production.

const APP: AppsStore.InstalledApp = {
  name: 'Testonaut',
  packageName: 'com.example.testonaut',
  icon: 'file://icon.png',
  isSystem: false,
};

function mockApps(app: AppsStore.InstalledApp, launchApp = jest.fn(() => Promise.resolve(true))) {
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps: [app],
    homeApps: [],
    dockApps: [],
    nonDockApps: [app],
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
  return launchApp;
}

// Full replacement of useSettings — mirrors the useApps() mock above so the
// screen's OTHER settings reads (wallpaperIndex, focusMode, batteryPercentage,
// and useGestureReduceMotion's own internal useSettings() call) keep getting
// a complete, valid SettingsState instead of undefined field crashes.
function mockSettings(overrides: Partial<SettingsStore.SettingsState>) {
  jest.spyOn(SettingsStore, 'useSettings').mockReturnValue({
    settings: { ...DEFAULT_SETTINGS, ...overrides },
    update: jest.fn(),
    updateMany: jest.fn(),
    reset: jest.fn(),
    syncFromDevice: jest.fn(() => Promise.resolve()),
    isReady: true,
    activeFocusMode: null,
    setFocusMode: jest.fn(),
  });
}

function mockMeasure(bounds: { x: number; y: number; width: number; height: number } | 'never') {
  const fn = MockNativeMethods.measureInWindow as jest.Mock;
  if (bounds === 'never') {
    fn.mockImplementation(() => {});
  } else {
    fn.mockImplementation((cb: (x: number, y: number, w: number, h: number) => void) =>
      cb(bounds.x, bounds.y, bounds.width, bounds.height));
  }
}

function mockSpringSettlesImmediately() {
  return jest.spyOn(Reanimated, 'withSpring').mockImplementation(
    ((toValue: number, _config: unknown, callback?: (finished: boolean) => void) => {
      callback?.(true);
      return toValue;
    }) as typeof Reanimated.withSpring,
  );
}

function mockSpringNeverSettles() {
  return jest.spyOn(Reanimated, 'withSpring').mockImplementation(
    ((toValue: number) => toValue) as typeof Reanimated.withSpring,
  );
}

describe('LauncherHomeScreen app-launch expand transition (#509)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // AppIcon hands the press handler a `measure()` function instead of
  // pre-computed bounds (a built-in route must stay perfectly synchronous —
  // see the entryPoints regression note below), so even a bounds delivery
  // that fires "immediately" still resolves through a microtask. Flushing one
  // tick here is that, not a wait for the spring.
  async function flushMeasurement() {
    await act(async () => { await Promise.resolve(); });
  }

  it('does NOT launch synchronously on press — the spring has not settled yet', async () => {
    mockSpringNeverSettles();
    mockMeasure({ x: 12, y: 34, width: 60, height: 60 });
    const launchApp = mockApps(APP);

    const { getByLabelText } = render(<LauncherHomeScreen />);
    fireEvent.press(getByLabelText(`Open ${APP.name}`));
    await flushMeasurement();

    expect(launchApp).not.toHaveBeenCalled();
  });

  it('shows the expand overlay anchored at the measured icon bounds while mid-flight', async () => {
    mockSpringNeverSettles();
    mockMeasure({ x: 12, y: 34, width: 60, height: 60 });
    mockApps(APP);

    const { getByLabelText, getByTestId } = render(<LauncherHomeScreen />);
    fireEvent.press(getByLabelText(`Open ${APP.name}`));
    await flushMeasurement();

    expect(getByTestId('app-launch-overlay')).toBeTruthy();
  });

  it('launches the pressed app once the expand spring reports it settled', async () => {
    mockSpringSettlesImmediately();
    mockMeasure({ x: 12, y: 34, width: 60, height: 60 });
    const launchApp = mockApps(APP);

    const { getByLabelText } = render(<LauncherHomeScreen />);
    fireEvent.press(getByLabelText(`Open ${APP.name}`));
    await flushMeasurement();

    expect(launchApp).toHaveBeenCalledWith(APP.packageName);
    expect(launchApp).toHaveBeenCalledTimes(1);
  });

  it('reduceMotion launches immediately with no overlay at all', () => {
    jest.spyOn(GestureReduceMotionModule, 'useGestureReduceMotion').mockReturnValue(true);
    mockSpringNeverSettles();
    mockMeasure({ x: 12, y: 34, width: 60, height: 60 });
    const launchApp = mockApps(APP);

    const { getByLabelText, queryByTestId } = render(<LauncherHomeScreen />);
    fireEvent.press(getByLabelText(`Open ${APP.name}`));

    expect(launchApp).toHaveBeenCalledWith(APP.packageName);
    expect(queryByTestId('app-launch-overlay')).toBeNull();
  });

  // Real timers on purpose: LauncherHomeScreen mounts AppLibraryContent (the
  // pager's last page) alongside a handful of AsyncStorage-driven providers,
  // and faking timers here made an unrelated, pre-existing conditional-hooks
  // issue in AppLibraryContent surface as a hung render — out of scope for
  // #509. The fallback window is a real 50ms, so waiting it out for real is
  // both simpler and avoids destabilizing those other providers' own timers.
  it('falls back to an unanimated launch when the icon bounds never arrive', async () => {
    mockSpringSettlesImmediately();
    mockMeasure('never');
    const launchApp = mockApps(APP);

    const { getByLabelText, queryByTestId } = render(<LauncherHomeScreen />);
    fireEvent.press(getByLabelText(`Open ${APP.name}`));

    // Bounds haven't "arrived" yet — nothing should have launched or animated.
    expect(launchApp).not.toHaveBeenCalled();
    expect(queryByTestId('app-launch-overlay')).toBeNull();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 75));
    });

    expect(launchApp).toHaveBeenCalledWith(APP.packageName);
    expect(queryByTestId('app-launch-overlay')).toBeNull();
  });

  it('collapses the overlay instead of leaving it stuck full-screen when the launch fails', async () => {
    mockSpringSettlesImmediately();
    mockMeasure({ x: 12, y: 34, width: 60, height: 60 });
    const launchApp = mockApps(APP, jest.fn(() => Promise.resolve(false)));

    const { getByLabelText, queryByTestId } = render(<LauncherHomeScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText(`Open ${APP.name}`));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(launchApp).toHaveBeenCalledWith(APP.packageName);
    expect(queryByTestId('app-launch-overlay')).toBeNull();
  });

  it('keeps the overlay mounted when the launch succeeds only after it actually resolves', async () => {
    let resolveLaunch: (ok: boolean) => void = () => {};
    const launchApp = jest.fn(() => new Promise<boolean>((resolve) => { resolveLaunch = resolve; }));
    mockSpringSettlesImmediately();
    mockMeasure({ x: 12, y: 34, width: 60, height: 60 });
    mockApps(APP, launchApp);

    const { getByLabelText, getByTestId, queryByTestId } = render(<LauncherHomeScreen />);

    fireEvent.press(getByLabelText(`Open ${APP.name}`));
    await flushMeasurement();
    expect(getByTestId('app-launch-overlay')).toBeTruthy();

    await act(async () => {
      resolveLaunch(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(queryByTestId('app-launch-overlay')).toBeNull();
  });

  // #512 §6.3: appLaunchAnimation exposes the icon-expand animation as an
  // on/off preference, independent of reduceMotion. Two things must hold:
  // (1) turning it off skips the JS-side overlay but still routes through
  // launchApp — which is where the Android system-transition suppression
  // lives (LauncherModule.kt's makeCustomAnimation(0,0), unconditional) — so
  // disabling this animation must never let the ugly OS transition back in.
  // (2) haptic feedback fires regardless of the setting (§3.2 regra 4).
  describe('appLaunchAnimation setting (#512 §6.3)', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('appLaunchAnimation: false launches immediately with no overlay (still suppresses the Android transition via launchApp)', () => {
      mockSettings({ appLaunchAnimation: false });
      mockSpringNeverSettles();
      mockMeasure({ x: 12, y: 34, width: 60, height: 60 });
      const launchApp = mockApps(APP);

      const { getByLabelText, queryByTestId } = render(<LauncherHomeScreen />);
      fireEvent.press(getByLabelText(`Open ${APP.name}`));

      expect(launchApp).toHaveBeenCalledWith(APP.packageName);
      expect(queryByTestId('app-launch-overlay')).toBeNull();
    });

    it('appLaunchAnimation: true (default) still shows the overlay when reduceMotion is off', async () => {
      mockSettings({ appLaunchAnimation: true });
      mockSpringNeverSettles();
      mockMeasure({ x: 12, y: 34, width: 60, height: 60 });
      mockApps(APP);

      const { getByLabelText, getByTestId } = render(<LauncherHomeScreen />);
      fireEvent.press(getByLabelText(`Open ${APP.name}`));
      await act(async () => { await Promise.resolve(); });

      expect(getByTestId('app-launch-overlay')).toBeTruthy();
    });

    it('reduceMotion wins over appLaunchAnimation: true — the future motionIntensity:"off" precedence, honoured today via reduceMotion', () => {
      mockSettings({ appLaunchAnimation: true, reduceMotion: true });
      mockSpringNeverSettles();
      mockMeasure({ x: 12, y: 34, width: 60, height: 60 });
      const launchApp = mockApps(APP);

      const { getByLabelText, queryByTestId } = render(<LauncherHomeScreen />);
      fireEvent.press(getByLabelText(`Open ${APP.name}`));

      expect(launchApp).toHaveBeenCalledWith(APP.packageName);
      expect(queryByTestId('app-launch-overlay')).toBeNull();
    });

    it('fires haptic feedback on press when appLaunchAnimation is false, same as when it is true', () => {
      const impactSpy = jest.spyOn(Haptics, 'impactAsync').mockResolvedValue();
      mockSettings({ appLaunchAnimation: false });
      mockSpringNeverSettles();
      mockMeasure({ x: 12, y: 34, width: 60, height: 60 });
      mockApps(APP);

      const { getByLabelText } = render(<LauncherHomeScreen />);
      // Other trees left mounted by earlier tests in this file (RTL doesn't
      // unmount between `it`s here) can pick up unrelated haptic calls of
      // their own; clear right before the action under test so only THIS
      // press is being measured.
      impactSpy.mockClear();
      fireEvent.press(getByLabelText(`Open ${APP.name}`));

      expect(impactSpy).toHaveBeenCalledTimes(1);
    });
  });
});
