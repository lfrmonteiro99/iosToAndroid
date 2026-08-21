import React from 'react';
import { render } from '../../../test-utils';
import { ScreenTimeScreen } from '../ScreenTimeScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

jest.mock('../../../../modules/launcher-module/src', () => ({
  __esModule: true,
  default: {
    isUsageAccessGranted: jest.fn(() => Promise.resolve(false)),
    getTodayScreenTime: jest.fn(() => Promise.resolve({ totalMinutes: 120, topApps: [] })),
    getScreenTimeStats: jest.fn(() => Promise.resolve([])),
    openUsageAccessSettings: jest.fn(() => Promise.resolve(true)),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const launcherMock = (jest.requireMock('../../../../modules/launcher-module/src') as { default: Record<string, jest.Mock> }).default;

jest.mock('../../../store/SettingsStore', () => ({
  useSettings: () => ({
    settings: {
      screenTimeEnabled: false,
      dailyLimit: 120,
      downtime: false,
      downtimeStart: '22:00',
      downtimeEnd: '08:00',
      automaticUpdates: false,
    },
    update: jest.fn(),
  }),
  SettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('ScreenTimeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    launcherMock.isUsageAccessGranted.mockResolvedValue(false);
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<ScreenTimeScreen navigation={mockNavigation} />);
    expect(toJSON()).toBeTruthy();
  });

  it('displays the navigation bar with back button', () => {
    const { getByText } = render(<ScreenTimeScreen navigation={mockNavigation} />);
    expect(getByText('Settings')).toBeTruthy();
  });

  it('does not show conditional content when screenTimeEnabled is false', () => {
    const { queryByText } = render(<ScreenTimeScreen navigation={mockNavigation} />);
    expect(queryByText('Usage Access Required')).toBeNull();
    expect(queryByText('Daily Limit')).toBeNull();
    expect(queryByText('Downtime')).toBeNull();
  });

  it('shows a switch for Screen Time setting', () => {
    const { getAllByRole } = render(<ScreenTimeScreen navigation={mockNavigation} />);
    const switches = getAllByRole('switch');
    expect(switches.length).toBeGreaterThan(0);
  });
});
