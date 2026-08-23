import React from 'react';
import { render, fireEvent } from '../../../test-utils';
import { BluetoothScreen } from '../BluetoothScreen';
import Ionicons from '@expo/vector-icons/Ionicons';

// Minimal shape of a rendered Ionicons host element we inspect for the icon name.
type IconInstance = { props: { name?: string } };

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

// A paired device with a generic (type 0) native type — the override must be
// able to relabel it as a speaker/headphones/car without touching the native type.
const pairedDevice = {
  name: 'My BT Speaker',
  address: 'AA:BB:CC:DD:EE:FF',
  type: 0,
  rssi: -50,
  bondState: 12,
};

function renderWithPaired() {
  mockUseDevice.mockReturnValue({
    ...baseDeviceValue,
    bluetooth: { enabled: true, name: 'Phone', address: '11:22:33', pairedDevices: [pairedDevice] },
  });
  return render(<BluetoothScreen navigation={mockNavigation} />);
}

function deviceTypeIcons(result: ReturnType<typeof render>) {
  // The paired-device tile's leading Ionicons carries the resolved icon name.
  // Exclude the trailing chevron glyph that every tappable tile also renders.
  return result.UNSAFE_getAllByType(Ionicons)
    .map((el: IconInstance) => el.props.name as string)
    .filter((name: string) => name && name !== 'chevron-forward');
}

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
    mockUseDevice.mockReturnValue({ ...baseDeviceValue, bluetoothError: true });
    const { getByText } = render(<BluetoothScreen navigation={mockNavigation} />);
    expect(getByText(/Could not load Bluetooth status/i)).toBeTruthy();
  });

  it('does not show error tile when bluetoothError is false', () => {
    mockUseDevice.mockReturnValue({ ...baseDeviceValue, bluetoothError: false });
    const { queryByText } = render(<BluetoothScreen navigation={mockNavigation} />);
    expect(queryByText(/Could not load Bluetooth status/i)).toBeNull();
  });

  it('opens the device-type picker when tapping a paired device', () => {
    const { getByText } = renderWithPaired();
    fireEvent.press(getByText('My BT Speaker'));
    // The action sheet surfaces the four iOS device-type choices.
    expect(getByText('Speaker')).toBeTruthy();
    expect(getByText('Headphones')).toBeTruthy();
    expect(getByText('Car Stereo')).toBeTruthy();
    expect(getByText('Other')).toBeTruthy();
  });

  it('does not open the picker when tapping the Forget button', () => {
    const { getByText, queryByText } = renderWithPaired();
    fireEvent.press(getByText(/Forget/i));
    expect(queryByText('Speaker')).toBeNull();
  });

  it('persists the chosen device type keyed by address and updates the icon', () => {
    const result = renderWithPaired();
    const { getByText } = result;
    const before = deviceTypeIcons(result);
    // Default generic type 0 → 'bluetooth' glyph.
    expect(before).toContain('bluetooth');

    fireEvent.press(getByText('My BT Speaker'));
    fireEvent.press(getByText('Speaker'));

    // After choosing "Speaker", the tile icon must reflect the override.
    const after = deviceTypeIcons(result);
    expect(after).toContain('volume-high-outline');
    expect(after).not.toContain('bluetooth');
  });

  it('keeps the native type when no override is set', () => {
    mockUseDevice.mockReturnValue({
      ...baseDeviceValue,
      bluetooth: {
        enabled: true,
        name: 'Phone',
        address: '11:22:33',
        pairedDevices: [{ ...pairedDevice, type: 7 }],
      },
    });
    const result = render(<BluetoothScreen navigation={mockNavigation} />);
    const names = result.UNSAFE_getAllByType(Ionicons).map((el: IconInstance) => el.props.name as string);
    // type 7 is a headset → headset-outline, untouched by any override.
    expect(names).toContain('headset-outline');
  });

  it('restores the override after re-opening the picker', () => {
    const result = renderWithPaired();
    const { getByText } = result;
    fireEvent.press(getByText('My BT Speaker'));
    fireEvent.press(getByText('Car Stereo'));
    // Reopen and confirm the previous choice is still applied (icon reflects override).
    fireEvent.press(getByText('My BT Speaker'));
    const after = deviceTypeIcons(result);
    expect(after).toContain('car-sport-outline');
  });
});
