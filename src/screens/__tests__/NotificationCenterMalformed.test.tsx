import React from 'react';
import { render, waitFor } from '../../test-utils';
import { Text } from 'react-native';
import { NotificationCenterScreen } from '../NotificationCenterScreen';
import launcherModule from '../../../modules/launcher-module/src';

/**
 * The native bridge (modules/launcher-module/src/index.ts) deliberately PASSES
 * THROUGH notifications whose `packageName` is missing/non-string — see
 * `dedupeByPackageName`, which keeps malformed native data instead of coercing
 * it. Those malformed entries reach `getNotifications()` and then this screen.
 *
 * The screen used to group notifications with `notif.packageName.split('.')`
 * (NotificationCenterScreen.tsx ~line 223) and test message-app membership with
 * `notif.packageName.includes(...)` (~line 311). With `packageName === undefined`
 * (or any non-string) both throw during render, taking down the whole screen —
 * which the app-wide ErrorBoundary then replaces with a near-white fallback.
 * That is the "blank white, no content" reported for the notification center.
 *
 * These tests exercise the REAL grouping/mapping path (the same useMemo the
 * screen runs), not a reimplementation, by mounting the real component and
 * feeding it malformed bridge data through the mocked module.
 */

interface RawNotif {
  id: string;
  key: string;
  packageName?: string | null;
  title?: string | null;
  text?: string | null;
  time?: number | null;
  isOngoing: boolean;
}

function makeNotif(over: Partial<RawNotif>): RawNotif {
  return { id: 'n0', key: 'n0', packageName: 'com.app0', title: 'Title', text: 'Body', time: Date.now(), isOngoing: false, ...over };
}

// Probe boundary: captures a render-time crash and renders it as a detectable
// text node (so the test can assert the screen did NOT crash, instead of relying
// on the app-wide ErrorBoundary silently swallowing it).
class Probe extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    if (this.state.err) {
      return <Text>{`CRASH:${this.state.err.message}`}</Text>;
    }
    return this.props.children as React.ReactElement;
  }
}

function grantAccess(notifs: RawNotif[]) {
  (launcherModule.isNotificationAccessGranted as jest.Mock).mockResolvedValue(true);
  (launcherModule.getNotifications as jest.Mock).mockResolvedValue(notifs);
}

describe('NotificationCenterScreen — malformed bridge data (issue #685)', () => {
  afterEach(() => {
    (launcherModule.isNotificationAccessGranted as jest.Mock).mockResolvedValue(false);
    (launcherModule.getNotifications as jest.Mock).mockResolvedValue([]);
  });

  it('does not crash when a notification has no packageName', async () => {
    grantAccess([makeNotif({ packageName: undefined })]);
    const { queryByText, getByText } = render(
      <Probe>
        <NotificationCenterScreen />
      </Probe>,
    );
    await waitFor(() => expect(getByText(/, \w+ \d+/)).toBeTruthy(), { timeout: 1500 });
    expect(queryByText(/^CRASH:/)).toBeNull();
  });

  it('does not crash when a notification has an empty-string packageName', async () => {
    grantAccess([makeNotif({ packageName: '' })]);
    const { queryByText, getByText } = render(
      <Probe>
        <NotificationCenterScreen />
      </Probe>,
    );
    await waitFor(() => expect(getByText(/, \w+ \d+/)).toBeTruthy(), { timeout: 1500 });
    expect(queryByText(/^CRASH:/)).toBeNull();
  });

  it('does not crash when a notification has a null packageName', async () => {
    grantAccess([makeNotif({ packageName: null })]);
    const { queryByText, getByText } = render(
      <Probe>
        <NotificationCenterScreen />
      </Probe>,
    );
    await waitFor(() => expect(getByText(/, \w+ \d+/)).toBeTruthy(), { timeout: 1500 });
    expect(queryByText(/^CRASH:/)).toBeNull();
  });

  it('still renders well-formed notifications after a malformed one', async () => {
    grantAccess([
      makeNotif({ packageName: undefined, key: 'bad', id: 'bad' }),
      makeNotif({ packageName: 'com.good.app', key: 'good', id: 'good', title: 'Good Title' }),
    ]);
    const { queryByText, getByText } = render(
      <Probe>
        <NotificationCenterScreen />
      </Probe>,
    );
    // The well-formed notification must still appear — the malformed one must
    // not take down the whole list.
    await waitFor(() => expect(getByText('Good Title')).toBeTruthy(), { timeout: 1500 });
    expect(queryByText(/^CRASH:/)).toBeNull();
  });

  it('does not crash when a notification is missing title/text/time fields', async () => {
    grantAccess([{ id: 'n0', key: 'n0', packageName: 'com.app0', isOngoing: false } as RawNotif]);
    const { queryByText, getByText } = render(
      <Probe>
        <NotificationCenterScreen />
      </Probe>,
    );
    await waitFor(() => expect(getByText(/, \w+ \d+/)).toBeTruthy(), { timeout: 1500 });
    expect(queryByText(/^CRASH:/)).toBeNull();
  });
});
