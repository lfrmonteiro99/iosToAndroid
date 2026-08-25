import React from 'react';
import { AppState, Text } from 'react-native';
import { render, waitFor, act } from '../../test-utils';
import { useApps } from '../AppsStore';

// Reported from a device: "the banner does not go away when the launcher IS set
// as default."
//
// `isDefault` was only ever written inside loadApps(), which runs on mount. The
// flow that matters most therefore got it wrong: tap "Set Now", Android's
// home-launcher picker opens, you pick this app, you come back — and nothing
// re-reads the status, so the "Set as default launcher" banner stayed up even
// though the launcher was now the default.
//
// A foreground transition is exactly when the answer can have changed, because
// changing it means leaving the app for the system picker. These tests drive the
// real AppState handler the store registers.

const launcherMock = jest.requireMock('../../../modules/launcher-module/src').default;

/** Captures the handlers AppsStore registers so a transition can be driven. */
let changeHandlers: ((state: string) => void)[] = [];

function fireAppState(state: string) {
  [...changeHandlers].forEach((h) => h(state));
}

function Probe() {
  const { isDefaultLauncher } = useApps();
  return <Text>{isDefaultLauncher ? 'default:yes' : 'default:no'}</Text>;
}

beforeEach(() => {
  jest.clearAllMocks();
  changeHandlers = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
    if (type === 'change') changeHandlers.push(handler as (s: string) => void);
    return {
      remove: () => {
        changeHandlers = changeHandlers.filter((h) => h !== handler);
      },
    } as never;
  });
  launcherMock.getInstalledApps.mockResolvedValue([]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AppsStore default-launcher refresh', () => {
  it('picks up becoming the default on the next foreground', async () => {
    // Mount not-default (the banner would be showing), then the user returns
    // from the picker having chosen this app.
    launcherMock.isDefaultLauncher.mockResolvedValue(false);
    const { getByText } = render(<Probe />);
    await waitFor(() => expect(getByText('default:no')).toBeTruthy());

    launcherMock.isDefaultLauncher.mockResolvedValue(true);
    await act(async () => {
      fireAppState('active');
    });

    await waitFor(() => expect(getByText('default:yes')).toBeTruthy());
  });

  it('picks up LOSING the default too, not just gaining it', async () => {
    // The other direction matters as much: switch away in the picker and the
    // banner has to come back.
    launcherMock.isDefaultLauncher.mockResolvedValue(true);
    const { getByText } = render(<Probe />);
    await waitFor(() => expect(getByText('default:yes')).toBeTruthy());

    launcherMock.isDefaultLauncher.mockResolvedValue(false);
    await act(async () => {
      fireAppState('active');
    });

    await waitFor(() => expect(getByText('default:no')).toBeTruthy());
  });

  it('does not re-check on background/inactive transitions', async () => {
    launcherMock.isDefaultLauncher.mockResolvedValue(false);
    render(<Probe />);
    await waitFor(() => expect(launcherMock.isDefaultLauncher).toHaveBeenCalled());

    const callsAfterMount = launcherMock.isDefaultLauncher.mock.calls.length;
    await act(async () => {
      fireAppState('background');
      fireAppState('inactive');
    });

    expect(launcherMock.isDefaultLauncher.mock.calls.length).toBe(callsAfterMount);
  });

  it('survives the native call rejecting — keeps the last known answer', async () => {
    // This is a background refresh of a banner's visibility, so a failure must
    // never surface or reset the state.
    launcherMock.isDefaultLauncher.mockResolvedValue(true);
    const { getByText } = render(<Probe />);
    await waitFor(() => expect(getByText('default:yes')).toBeTruthy());

    launcherMock.isDefaultLauncher.mockRejectedValue(new Error('binder died'));
    await act(async () => {
      fireAppState('active');
    });

    expect(getByText('default:yes')).toBeTruthy();
  });

  it('registers a change listener at all', () => {
    launcherMock.isDefaultLauncher.mockResolvedValue(false);
    render(<Probe />);
    expect(changeHandlers.length).toBeGreaterThan(0);
  });
});
