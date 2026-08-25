import React from 'react';
import { render, waitFor } from '../../../test-utils';
import { PrivacyScreen } from '../PrivacyScreen';
import type { NetworkUsageApp } from '../../../../modules/launcher-module/src';

// Explicit factory mock rather than the shared src/__mocks__/launcherModule.js
// singleton: this test's LauncherModule stub needs `getNetworkUsageByApp`
// wired independently per test case, and an inline factory is resolved
// directly by Jest for THIS specifier without depending on the moduleNameMapper
// + __mocks__ resolution path other suites in this repo share.
const mockGetNetworkUsageByApp = jest.fn<Promise<NetworkUsageApp[]>, [number]>(() => Promise.resolve([]));
const mockCheckPermissions = jest.fn<Promise<Record<string, boolean>>, []>(() => Promise.resolve({}));

jest.mock('../../../../modules/launcher-module/src', () => ({
  __esModule: true,
  default: {
    checkPermissions: () => mockCheckPermissions(),
    getNetworkUsageByApp: (sinceMs: number) => mockGetNetworkUsageByApp(sinceMs),
    openSystemSettings: jest.fn(() => Promise.resolve(true)),
    requestAllPermissions: jest.fn(() => Promise.resolve(true)),
  },
}));

jest.mock('../../../store/SettingsStore', () => ({
  useSettings: () => ({
    settings: { locationServices: false },
    update: jest.fn(),
  }),
  SettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

describe('PrivacyScreen — Network usage card (#624-S4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckPermissions.mockResolvedValue({});
  });

  it('shows per-app data usage in MB, distinct from the sensor-access permission rows', async () => {
    mockGetNetworkUsageByApp.mockResolvedValue([
      { packageName: 'com.example.big', appName: 'Big App', txBytes: 4 * 1024 * 1024, rxBytes: 1 * 1024 * 1024 },
      { packageName: 'com.example.small', appName: 'Small App', txBytes: 100 * 1024, rxBytes: 0 },
    ]);

    const { findByText, getByText } = render(<PrivacyScreen navigation={mockNavigation as never} />);

    await waitFor(() => {
      expect(mockGetNetworkUsageByApp).toHaveBeenCalled();
    });

    // Section is labelled "Network" and reports bytes transferred (MB), never
    // an access "count" — that vocabulary belongs to the sensor-access section.
    expect(getByText('Network')).toBeTruthy();
    expect(await findByText('Big App')).toBeTruthy();
    expect(await findByText('5.0 MB')).toBeTruthy(); // 4MB + 1MB total
    expect(await findByText('Small App')).toBeTruthy();
    expect(await findByText('< 0.1 MB')).toBeTruthy();
  });

  it('shows an empty-state message when no usage has been recorded yet', async () => {
    mockGetNetworkUsageByApp.mockResolvedValue([]);

    const { findByText } = render(<PrivacyScreen navigation={mockNavigation as never} />);

    expect(await findByText(/No network usage data yet/i)).toBeTruthy();
  });

  it('orders apps by total bytes transferred, highest first', async () => {
    mockGetNetworkUsageByApp.mockResolvedValue([
      { packageName: 'low', appName: 'Low', txBytes: 1024, rxBytes: 0 },
      { packageName: 'high', appName: 'High', txBytes: 10 * 1024 * 1024, rxBytes: 0 },
    ]);

    const { findByText, toJSON } = render(<PrivacyScreen navigation={mockNavigation as never} />);
    await findByText('High');

    const flatText = JSON.stringify(toJSON());
    expect(flatText.indexOf('High')).toBeGreaterThanOrEqual(0);
    expect(flatText.indexOf('Low')).toBeGreaterThanOrEqual(0);
    expect(flatText.indexOf('High')).toBeLessThan(flatText.indexOf('Low'));
  });
});
