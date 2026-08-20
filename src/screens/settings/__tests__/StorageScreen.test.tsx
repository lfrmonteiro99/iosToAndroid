import React from 'react';
import { render } from '../../../test-utils';
import { StorageScreen } from '../StorageScreen';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => false) }),
  useRoute: () => ({ params: {} }),
}));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'Light' },
  impactAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../utils/haptics', () => ({
  hapticImpact: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    removeMany: jest.fn(() => Promise.resolve()),
    multiGet: jest.fn(() => Promise.resolve([])),
    getAllKeys: jest.fn(() => Promise.resolve([])),
    getMany: jest.fn(() => Promise.resolve({})),
  },
}));

jest.mock('../../../store/SettingsStore', () => ({
  useSettings: jest.fn(() => ({ settings: { automaticUpdates: true, updateAvailable: false }, update: jest.fn() })),
  SettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockStorage = {
  usedGB: '10',
  totalGB: '64',
  freeGB: '54',
  usedPercentage: 15.6,
};

const mockUseDevice = jest.fn();

jest.mock('../../../store/DeviceStore', () => ({
  useDevice: () => mockUseDevice(),
  DeviceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DeviceContext: null,
}));

const baseDeviceValue = {
  openSystemPanel: jest.fn(),
  storage: mockStorage,
  storageError: false,
  settings: {},
};

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };

describe('StorageScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDevice.mockReturnValue(baseDeviceValue);
  });
  it('renders without crashing', () => {
    const { toJSON } = render(<StorageScreen navigation={mockNavigation as never} />);
    expect(toJSON()).toBeTruthy();
  });

  // RED: before fix, estimated categories had no disclosure. After fix, they show "(est.)".
  it('shows (est.) marker on Photos & Media, Messages, and System', () => {
    const { getAllByText } = render(<StorageScreen navigation={mockNavigation as never} />);
    // Each estimated category value ends with " (est.)"
    const estMarkers = getAllByText(/\(est\.\)/);
    expect(estMarkers.length).toBeGreaterThanOrEqual(3); // Photos, Messages, System
  });

  it('does NOT show (est.) marker on Apps category', () => {
    const { queryAllByText, getByText } = render(<StorageScreen navigation={mockNavigation as never} />);
    // Apps tile must exist
    expect(getByText('Apps')).toBeTruthy();
    // The Apps value row should not contain "(est.)"
    const estItems = queryAllByText(/\(est\.\)/);
    // Verify count is exactly 3 (Photos, Messages, System) — not 4 or 5
    expect(estItems).toHaveLength(3);
  });

  it('shows footnote about estimated values', () => {
    const { getByText } = render(<StorageScreen navigation={mockNavigation as never} />);
    expect(getByText(/Photos.*Messages.*System.*estimates/i)).toBeTruthy();
  });

  it('estimated values use at most 1 decimal place for GB', () => {
    const { getAllByText } = render(<StorageScreen navigation={mockNavigation as never} />);
    const estItems = getAllByText(/\(est\.\)/);
    estItems.forEach((item) => {
      const text = item.props.children;
      if (typeof text === 'string' && text.includes('GB')) {
        // Should be "X.X GB (est.)" — at most 1 decimal, not 2
        expect(text).toMatch(/^\d+(\.\d)? GB \(est\.\)$/);
      }
    });
  });

  it('shows error tile when storageError is true', () => {
    // Red: before fix, storageError did not exist. After fix, error tile appears.
    mockUseDevice.mockReturnValue({ ...baseDeviceValue, storageError: true });
    const { getByText } = render(<StorageScreen navigation={mockNavigation as never} />);
    expect(getByText(/Could not load storage information/i)).toBeTruthy();
  });

  it('does not show error tile when storageError is false', () => {
    mockUseDevice.mockReturnValue({ ...baseDeviceValue, storageError: false });
    const { queryByText } = render(<StorageScreen navigation={mockNavigation as never} />);
    expect(queryByText(/Could not load storage information/i)).toBeNull();
  });
});
