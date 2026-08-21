import React from 'react';
import * as Reanimated from 'react-native-reanimated';
import MockNativeMethods from 'react-native/jest/MockNativeMethods';
import { render, fireEvent, act } from '../../test-utils';
import { LauncherHomeScreen } from '../LauncherHomeScreen';
import * as AppsStore from '../../store/AppsStore';
import * as GestureReduceMotionModule from '../../utils/useGestureReduceMotion';

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
  } as ReturnType<typeof AppsStore.useApps>);
  return launchApp;
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
});
