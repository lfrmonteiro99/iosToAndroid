import React from 'react';
import { render, waitFor, act } from '../../test-utils';
import { NotificationCenterScreen } from '../NotificationCenterScreen';
import launcherModule, {
  addNotificationListener,
  addNotificationRemovedListener,
} from '../../../modules/launcher-module/src';

interface MockNotif {
  id: string;
  key: string;
  packageName: string;
  title: string;
  text: string;
  time: number;
  isOngoing: boolean;
}

function notif(i: number): MockNotif {
  return {
    id: `n${i}`,
    key: `k${i}`,
    packageName: `com.app${i}`,
    title: `Title ${i}`,
    text: `Body ${i}`,
    time: Date.now(),
    isOngoing: false,
  };
}

/**
 * #646: the notification center fetched getNotifications() once on mount and
 * never subscribed to the live onNotificationPosted / onNotificationRemoved
 * events. So while the screen was open, incoming notifications (and removals)
 * never appeared — the OS shade updated but the center stayed frozen.
 *
 * These tests mount the REAL screen and capture the onNotificationPosted
 * handler the screen registers, then fire it and assert the list updates.
 */
describe('NotificationCenterScreen live update (issue #646)', () => {
  afterEach(() => {
    jest.clearAllMocks();
    (launcherModule.isNotificationAccessGranted as jest.Mock).mockResolvedValue(false);
    (launcherModule.getNotifications as jest.Mock).mockResolvedValue([]);
    (addNotificationListener as jest.Mock).mockReturnValue(() => {});
    (addNotificationRemovedListener as jest.Mock).mockReturnValue(() => {});
  });

  it('subscribes to onNotificationPosted on mount and adds a new notification live', async () => {
    (launcherModule.isNotificationAccessGranted as jest.Mock).mockResolvedValue(true);
    (launcherModule.getNotifications as jest.Mock).mockResolvedValue([notif(0)]);
    (addNotificationListener as jest.Mock).mockReturnValue(() => {});

    const { getByText } = render(<NotificationCenterScreen />);
    await waitFor(() => expect(getByText('Title 0')).toBeTruthy());

    // The screen registered a live listener.
    expect(addNotificationListener).toHaveBeenCalledTimes(1);
    const liveHandler = (addNotificationListener as jest.Mock).mock.calls[0][0];

    // A new notification arrives while the screen is open.
    act(() => {
      liveHandler(notif(1));
    });

    await waitFor(() => expect(getByText('Title 1')).toBeTruthy());
  });

  it('removes a notification live when onNotificationRemoved fires with its key', async () => {
    (launcherModule.isNotificationAccessGranted as jest.Mock).mockResolvedValue(true);
    (launcherModule.getNotifications as jest.Mock).mockResolvedValue([notif(0), notif(1)]);
    (addNotificationListener as jest.Mock).mockReturnValue(() => {});
    (addNotificationRemovedListener as jest.Mock).mockReturnValue(() => {});

    const { getByText, queryByText } = render(<NotificationCenterScreen />);
    await waitFor(() => expect(getByText('Title 0')).toBeTruthy());
    await waitFor(() => expect(getByText('Title 1')).toBeTruthy());

    expect(addNotificationRemovedListener).toHaveBeenCalledTimes(1);
    const removedHandler = (addNotificationRemovedListener as jest.Mock).mock.calls[0][0];

    // Native removes the notification with key k1.
    act(() => {
      removedHandler('k1');
    });

    await waitFor(() => expect(queryByText('Title 1')).toBeNull());
    expect(getByText('Title 0')).toBeTruthy();
  });

  it('unsubscribes from both listeners on unmount (no leak)', async () => {
    (launcherModule.isNotificationAccessGranted as jest.Mock).mockResolvedValue(true);
    (launcherModule.getNotifications as jest.Mock).mockResolvedValue([]);
    const postRemove = jest.fn();
    const removedRemove = jest.fn();
    (addNotificationListener as jest.Mock).mockReturnValue(postRemove);
    (addNotificationRemovedListener as jest.Mock).mockReturnValue(removedRemove);

    const { unmount } = render(<NotificationCenterScreen />);
    await waitFor(() => expect(addNotificationListener).toHaveBeenCalled());

    unmount();

    expect(postRemove).toHaveBeenCalledTimes(1);
    expect(removedRemove).toHaveBeenCalledTimes(1);
  });
});
