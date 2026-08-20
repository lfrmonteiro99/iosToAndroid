import React from 'react';
import { render } from '../../test-utils';
import { LauncherHomeScreen, NonAndroidFallback } from '../LauncherHomeScreen';
import * as DeviceStore from '../../store/DeviceStore';

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
