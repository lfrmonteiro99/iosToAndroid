import React from 'react';
import { Pressable, Text } from 'react-native';
import { render, fireEvent, act } from '../../test-utils';
import { NotificationBanner, BannerNotification } from '../NotificationBanner';
import * as Haptics from 'expo-haptics';
import { setHapticsEnabled } from '../../utils/haptics';
import { useSettings } from '../../store/SettingsStore';

/**
 * Turns the real `vibration` setting off, the same way the Sounds & Haptics
 * screen does. SettingsStore pushes it into the haptics cache, so this exercises
 * the full chain instead of poking the cache directly.
 */
function DisableVibration() {
  const { update } = useSettings();
  return (
    <Pressable testID="disable-vibration" onPress={() => update('vibration', false)}>
      <Text>off</Text>
    </Pressable>
  );
}

// NotificationBanner used to call Haptics.notificationAsync() directly (H5), which
// (a) ignored the user's vibration setting and (b) left the returned promise
// unhandled when the native call rejected. It now goes through hapticNotification()
// from src/utils/haptics.ts. Both properties are asserted below.

function makeNotification(over?: Partial<BannerNotification>): BannerNotification {
  return {
    id: 'n1',
    appName: 'Messages',
    title: 'Ana',
    body: 'Olá',
    ...over,
  };
}

/**
 * Runs `fn` with a process-level unhandledRejection listener attached and
 * returns everything Node reported as unhandled while it ran. Node emits the
 * event once the microtask queue drains with no handler attached, so a macrotask
 * turn is awaited before reading the result.
 */
async function collectUnhandledRejections(fn: () => void): Promise<unknown[]> {
  const captured: unknown[] = [];
  const handler = (reason: unknown) => captured.push(reason);
  process.on('unhandledRejection', handler);
  try {
    fn();
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    process.off('unhandledRejection', handler);
  }
  return captured;
}

describe('NotificationBanner haptics (H5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setHapticsEnabled(true);
  });

  afterEach(() => {
    setHapticsEnabled(true);
  });

  it('plays success notification haptics when a banner appears', () => {
    render(<NotificationBanner notification={makeNotification()} onDismiss={jest.fn()} />);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
  });

  it('does not touch the native module when the user disabled vibration', () => {
    const { getByTestId, rerender } = render(
      <>
        <DisableVibration />
        <NotificationBanner notification={null} onDismiss={jest.fn()} />
      </>,
    );

    fireEvent.press(getByTestId('disable-vibration'));

    rerender(
      <>
        <DisableVibration />
        <NotificationBanner notification={makeNotification()} onDismiss={jest.fn()} />
      </>,
    );

    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('does not play haptics when there is no notification to show', () => {
    render(<NotificationBanner notification={null} onDismiss={jest.fn()} />);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('stops playing haptics once the banner is cleared', () => {
    // Inverse of the happy path: after the banner goes away, re-renders must not
    // keep buzzing. (A "same notification twice" assertion is not written here on
    // purpose: jest.setup.js stubs useSharedValue with a fresh object per render,
    // so the effect's deps churn in tests only — that would assert the mock, not
    // the component.)
    const onDismiss = jest.fn();
    const { rerender } = render(
      <NotificationBanner notification={makeNotification()} onDismiss={onDismiss} />,
    );
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);

    rerender(<NotificationBanner notification={null} onDismiss={onDismiss} />);
    rerender(<NotificationBanner notification={null} onDismiss={onDismiss} />);

    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  });

  it('plays haptics again for each distinct notification', () => {
    const onDismiss = jest.fn();
    const { rerender } = render(
      <NotificationBanner notification={makeNotification({ id: 'n1' })} onDismiss={onDismiss} />,
    );
    rerender(
      <NotificationBanner notification={makeNotification({ id: 'n2' })} onDismiss={onDismiss} />,
    );
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(2);
  });

  it('does not leak an unhandled rejection when the native module rejects', async () => {
    (Haptics.notificationAsync as jest.Mock).mockRejectedValueOnce(
      new Error('haptics unavailable'),
    );

    const unhandled = await collectUnhandledRejections(() => {
      render(<NotificationBanner notification={makeNotification()} onDismiss={jest.fn()} />);
    });

    expect(Haptics.notificationAsync).toHaveBeenCalled();
    expect(unhandled).toEqual([]);
  });
});

// The full provider tree from test-utils is required: ThemeProvider itself calls
// useSettings. DeviceStore/SettingsStore install timers on mount, but with fake
// timers they only fire inside the act() blocks below (their state updates are
// flushed there), so they don't interfere with the banner's own timer window.
describe('NotificationBanner auto-dismiss (M3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('auto-dismisses after the timer, calling onDismiss exactly once', () => {
    const onDismiss = jest.fn();
    render(<NotificationBanner notification={makeNotification()} onDismiss={onDismiss} />);

    act(() => {
      jest.advanceTimersByTime(5000); // auto-dismiss timer fires → dismiss() schedules onDismiss in 250ms
    });
    act(() => {
      jest.advanceTimersByTime(250); // exit-animation window → onDismiss
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending onDismiss when a new banner replaces the old one during the exit animation', () => {
    const onDismiss = jest.fn();
    const { rerender } = render(
      <NotificationBanner notification={makeNotification({ id: 'n1' })} onDismiss={onDismiss} />,
    );

    act(() => {
      jest.advanceTimersByTime(5000); // old banner auto-dismisses → onDismiss scheduled in 250ms
    });

    // A new banner arrives before the old one's delayed onDismiss runs.
    rerender(<NotificationBanner notification={makeNotification({ id: 'n2' })} onDismiss={onDismiss} />);

    act(() => {
      jest.advanceTimersByTime(250);
    });

    // The old banner's stale onDismiss must not clear the new banner.
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does not call onDismiss after the banner unmounts while the exit animation is pending', () => {
    const onDismiss = jest.fn();
    const { unmount } = render(
      <NotificationBanner notification={makeNotification()} onDismiss={onDismiss} />,
    );

    act(() => {
      jest.advanceTimersByTime(5000); // dismiss() schedules onDismiss in 250ms
    });

    unmount(); // banner goes away inside the 250ms exit window

    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
