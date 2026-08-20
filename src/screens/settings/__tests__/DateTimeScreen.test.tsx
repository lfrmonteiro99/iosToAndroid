import React from 'react';
import { render, waitFor } from '../../../test-utils';
import { DateTimeScreen } from '../DateTimeScreen';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    multiGet: jest.fn(() => Promise.resolve([])),
    getAllKeys: jest.fn(() => Promise.resolve([])),
    getMany: jest.fn(() => Promise.resolve({})),
  },
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  // no-op: calling setNow during render phase (as (cb) => { cb(); } does) causes infinite re-renders
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => false) }),
  useRoute: () => ({ params: {} }),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
}));

jest.mock('../../../store/DeviceStore', () => ({
  useDevice: () => ({ openSystemPanel: jest.fn(), settings: {} }),
  DeviceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DeviceContext: null,
}));

const mockSettingsValue = { dateTimeAutomatic: false, use24Hour: false };

jest.mock('../../../store/SettingsStore', () => ({
  useSettings: jest.fn(() => ({ settings: mockSettingsValue, update: jest.fn() })),
  SettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

// Midnight UTC = 9:00 AM in Asia/Tokyo
const FIXED_DATE = new Date('2026-01-01T00:00:00.000Z');

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
  jest.setSystemTime(FIXED_DATE);
  mockSettingsValue.dateTimeAutomatic = false;
  mockSettingsValue.use24Hour = false;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useSettings } = require('../../../store/SettingsStore');
  (useSettings as jest.Mock).mockReturnValue({ settings: mockSettingsValue, update: jest.fn() });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  AsyncStorage.getItem.mockResolvedValue(null);
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('DateTimeScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<DateTimeScreen navigation={mockNavigation as never} />);
    expect(toJSON()).toBeTruthy();
  });

  // RED: before fix, Date/Time rows used toLocaleDateString()/toLocaleTimeString() which
  // ignore selectedTimezone. After fix, Intl.DateTimeFormat with timeZone option is used.
  it('shows Tokyo time when selectedTimezone=Asia/Tokyo and dateTimeAutomatic=false', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    // Only return 'Asia/Tokyo' for the timezone key; other keys (ProfileStore etc.) need null/JSON-safe value
    AsyncStorage.getItem.mockImplementation((key: string) =>
      key === '@iostoandroid/timezone' ? Promise.resolve('Asia/Tokyo') : Promise.resolve(null)
    );

    const expectedTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(FIXED_DATE);

    const { findByText } = render(<DateTimeScreen navigation={mockNavigation as never} />);
    // After fix: Time row is formatted with Asia/Tokyo → 9:00 AM for midnight UTC
    await findByText(expectedTime, {}, { timeout: 5000 });
  });

  // Validates the try/catch guard around Intl.DateTimeFormat:
  // without try/catch, an invalid timezone would crash the component on next render.
  it('does not crash with an invalid stored timezone (try/catch guard)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    AsyncStorage.getItem.mockImplementation((key: string) =>
      key === '@iostoandroid/timezone' ? Promise.resolve('Not/A/Valid/Timezone') : Promise.resolve(null)
    );

    const { toJSON } = render(<DateTimeScreen navigation={mockNavigation as never} />);
    await waitFor(() => expect(toJSON()).toBeTruthy(), { timeout: 5000 });
  });

  it('uses device timezone when dateTimeAutomatic=true (Intl called without timeZone)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useSettings } = require('../../../store/SettingsStore');
    (useSettings as jest.Mock).mockReturnValue({
      settings: { dateTimeAutomatic: true, use24Hour: false },
      update: jest.fn(),
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    // stored but must be ignored when automatic=true
    AsyncStorage.getItem.mockImplementation((key: string) =>
      key === '@iostoandroid/timezone' ? Promise.resolve('Asia/Tokyo') : Promise.resolve(null)
    );

    const expectedTimeDevice = new Intl.DateTimeFormat('en-US', {
      timeZone: undefined, // device timezone
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(FIXED_DATE);

    const { findByText } = render(<DateTimeScreen navigation={mockNavigation as never} />);
    await findByText(expectedTimeDevice, {}, { timeout: 5000 });
  });
});
