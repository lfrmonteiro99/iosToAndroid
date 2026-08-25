import React from 'react';
import { render, waitFor } from '../../../test-utils';
import { Platform } from 'react-native';
import { PrivacyScreen } from '../PrivacyScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const launcherMock = require('../../../__mocks__/launcherModule').default;

// Snapshot of the real Platform state so we restore it after each test.
const originalOS = Platform.OS;

function setAndroid() {
  Platform.OS = 'android';
}

function setIos() {
  Platform.OS = 'ios';
}

describe('PrivacyScreen — Screen Time card (#624-S3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    launcherMock.checkPermissions.mockResolvedValue({});
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('renders the app name and formatted usage time from getScreenTimeStats(1)', async () => {
    setAndroid();
    launcherMock.getScreenTimeStats.mockResolvedValue([
      { appName: 'X', totalTimeMs: 120000, packageName: 'com.x', date: '2026-08-24' },
    ]);

    const { getByText } = render(<PrivacyScreen navigation={mockNavigation as never} />);

    await waitFor(() => {
      expect(launcherMock.getScreenTimeStats).toHaveBeenCalledWith(1);
    });
    expect(getByText('X')).toBeTruthy();
    expect(getByText('2 min')).toBeTruthy();
  });

  it('labels the card "Screen Time" / usage time, never "access"', async () => {
    setAndroid();
    launcherMock.getScreenTimeStats.mockResolvedValue([
      { appName: 'X', totalTimeMs: 120000, packageName: 'com.x', date: '2026-08-24' },
    ]);

    const { getByText, queryByText } = render(<PrivacyScreen navigation={mockNavigation as never} />);

    await waitFor(() => {
      expect(launcherMock.getScreenTimeStats).toHaveBeenCalled();
    });
    expect(getByText('Screen Time')).toBeTruthy();
    expect(getByText(/usage time/i)).toBeTruthy();
    // Never say "access"/"acesso" as visible copy — this is aggregate
    // time-on-screen, not a sensor/permission access log. (Internal RN a11y
    // props like accessibilityLabel are not user-visible text and are exempt.)
    expect(queryByText(/access/i)).toBeNull();
    expect(queryByText(/acesso/i)).toBeNull();
  });

  it('sorts apps by totalTimeMs descending', async () => {
    setAndroid();
    launcherMock.getScreenTimeStats.mockResolvedValue([
      { appName: 'Small', totalTimeMs: 60000, packageName: 'com.small', date: '2026-08-24' },
      { appName: 'Big', totalTimeMs: 600000, packageName: 'com.big', date: '2026-08-24' },
    ]);

    const { getByText, getAllByText } = render(<PrivacyScreen navigation={mockNavigation as never} />);

    await waitFor(() => {
      expect(launcherMock.getScreenTimeStats).toHaveBeenCalled();
    });
    expect(getByText('10 min')).toBeTruthy(); // Big: 600000ms
    expect(getByText('1 min')).toBeTruthy(); // Small: 60000ms
    // "Big" should appear before "Small" in the rendered tree.
    const names = getAllByText(/Big|Small/).map((n) => n.props.children);
    expect(names).toEqual(['Big', 'Small']);
  });

  it('shows a fallback when there is no usage data yet', async () => {
    setAndroid();
    launcherMock.getScreenTimeStats.mockResolvedValue([]);

    const { getByText } = render(<PrivacyScreen navigation={mockNavigation as never} />);

    await waitFor(() => {
      expect(launcherMock.getScreenTimeStats).toHaveBeenCalled();
    });
    expect(getByText('No usage data yet')).toBeTruthy();
  });

  it('rounds sub-minute usage to "< 1 min" instead of "0 min"', async () => {
    setAndroid();
    launcherMock.getScreenTimeStats.mockResolvedValue([
      { appName: 'Tiny', totalTimeMs: 5000, packageName: 'com.tiny', date: '2026-08-24' },
    ]);

    const { getByText } = render(<PrivacyScreen navigation={mockNavigation as never} />);

    await waitFor(() => {
      expect(launcherMock.getScreenTimeStats).toHaveBeenCalled();
    });
    expect(getByText('< 1 min')).toBeTruthy();
  });

  it('does not show the Screen Time card on iOS and never calls getScreenTimeStats', async () => {
    setIos();

    const { queryByText } = render(<PrivacyScreen navigation={mockNavigation as never} />);

    // Give any stray effects a tick to run.
    await waitFor(() => {
      expect(launcherMock.checkPermissions).not.toHaveBeenCalled();
    });
    expect(queryByText('Screen Time')).toBeNull();
    expect(launcherMock.getScreenTimeStats).not.toHaveBeenCalled();
  });
});
