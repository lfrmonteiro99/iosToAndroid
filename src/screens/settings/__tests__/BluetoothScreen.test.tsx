import React from 'react';
import { render } from '../../../test-utils';
import { BluetoothScreen } from '../BluetoothScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

const mockUseDevice = jest.fn();

jest.mock('../../../store/DeviceStore', () => ({
  useDevice: () => mockUseDevice(),
  DeviceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DeviceContext: null,
}));

const baseDeviceValue = {
  bluetooth: { enabled: false, name: '', address: '', pairedDevices: [] },
  bluetoothError: false,
  toggleBluetooth: jest.fn(),
  refresh: jest.fn(),
};

describe('BluetoothScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDevice.mockReturnValue(baseDeviceValue);
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<BluetoothScreen navigation={mockNavigation} />);
    expect(toJSON()).toBeTruthy();
  });

  it('shows error tile when bluetoothError is true', () => {
    // Red: before fix, bluetoothError did not exist. After fix, error tile appears.
    mockUseDevice.mockReturnValue({ ...baseDeviceValue, bluetoothError: true });
    const { getByText } = render(<BluetoothScreen navigation={mockNavigation} />);
    expect(getByText(/Could not load Bluetooth status/i)).toBeTruthy();
  });

  it('does not show error tile when bluetoothError is false', () => {
    mockUseDevice.mockReturnValue({ ...baseDeviceValue, bluetoothError: false });
    const { queryByText } = render(<BluetoothScreen navigation={mockNavigation} />);
    expect(queryByText(/Could not load Bluetooth status/i)).toBeNull();
  });
});
