import React from 'react';
import { render, waitFor } from '../../../test-utils';
import { WifiScreen } from '../WifiScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

// Static import in WifiScreen (post-refactor from dynamic import) allows Jest's mock
// registry to intercept it normally. Path from this __tests__/ dir needs 4 levels up
// to reach project root (one deeper than the component's location).
jest.mock('../../../../modules/launcher-module/src', () => ({
  __esModule: true,
  default: {
    isLocationEnabled: jest.fn(() => Promise.resolve(true)),
    getWifiNetworks: jest.fn(() => Promise.resolve([])),
    getWifiInfo: jest.fn(() => Promise.resolve({ enabled: true, ssid: '', rssi: 0, ip: '' })),
    setWifiEnabled: jest.fn(() => Promise.resolve(true)),
    openSystemSettings: jest.fn(() => Promise.resolve(true)),
    getNetworkInfo: jest.fn(() => Promise.resolve({ isConnected: true })),
    joinWifiNetwork: jest.fn(() => Promise.resolve(false)),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const launcherMock = (jest.requireMock('../../../../modules/launcher-module/src') as { default: Record<string, jest.Mock> }).default;

const mockUseDevice = jest.fn();

jest.mock('../../../store/DeviceStore', () => ({
  useDevice: () => mockUseDevice(),
  DeviceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DeviceContext: null,
}));

const baseDeviceValue = {
  wifi: { enabled: true, ssid: '', rssi: 0, linkSpeed: 0, ip: '' },
  wifiError: false,
  toggleWifi: jest.fn(),
  openSystemPanel: jest.fn(),
};

describe('WifiScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDevice.mockReturnValue(baseDeviceValue);
    launcherMock.isLocationEnabled.mockResolvedValue(true);
    launcherMock.getWifiNetworks.mockResolvedValue([]);
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<WifiScreen navigation={mockNavigation} />);
    expect(toJSON()).toBeTruthy();
  });

  it('shows location-disabled message when location is off and networks empty', async () => {
    launcherMock.isLocationEnabled.mockResolvedValue(false);
    const { findByText } = render(<WifiScreen navigation={mockNavigation} />);
    await findByText(/Turn on Location/i, {}, { timeout: 5000 });
  });

  it('does not show location message when location is on and networks empty', async () => {
    launcherMock.isLocationEnabled.mockResolvedValue(true);
    const { queryByText } = render(<WifiScreen navigation={mockNavigation} />);
    await waitFor(() => {
      expect(queryByText(/Turn on Location/i)).toBeNull();
    }, { timeout: 3000 });
  });

  it('shows error tile when wifiError is true', () => {
    // Red: before fix, wifiError was not read by WifiScreen (field didn't exist).
    // After fix, WifiScreen renders an error tile when DeviceStore signals a bridge failure.
    mockUseDevice.mockReturnValue({ ...baseDeviceValue, wifiError: true });
    const { getByText } = render(<WifiScreen navigation={mockNavigation} />);
    expect(getByText(/Could not load Wi-Fi status/i)).toBeTruthy();
  });

  it('does not show error tile when wifiError is false', () => {
    mockUseDevice.mockReturnValue({ ...baseDeviceValue, wifiError: false });
    const { queryByText } = render(<WifiScreen navigation={mockNavigation} />);
    expect(queryByText(/Could not load Wi-Fi status/i)).toBeNull();
  });
});
