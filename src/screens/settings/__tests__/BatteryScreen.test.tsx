import React from 'react';
import { render, fireEvent } from '../../../test-utils';
import { BatteryScreen } from '../BatteryScreen';

const mockUpdate = jest.fn();
const baseSettings = { lowPowerMode: false, batteryPercentage: true };

jest.mock('../../../store/SettingsStore', () => ({
  useSettings: jest.fn(() => ({ settings: baseSettings, update: mockUpdate })),
  SettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../../store/DeviceStore', () => ({
  useDevice: () => ({ battery: { level: 0.72, isCharging: false } }),
  DeviceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DeviceContext: null,
}));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

describe('BatteryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useSettings } = require('../../../store/SettingsStore');
    (useSettings as jest.Mock).mockReturnValue({
      settings: { ...baseSettings },
      update: mockUpdate,
    });
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<BatteryScreen navigation={mockNavigation as never} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the battery percentage read from device state', () => {
    const { getByText } = render(<BatteryScreen navigation={mockNavigation as never} />);
    // level 0.72 -> Math.round(0.72 * 100) = 72
    expect(getByText('72%')).toBeTruthy();
    expect(getByText('Not Charging')).toBeTruthy();
  });

  it('renders the Low Power Mode and Battery Percentage toggles', () => {
    const { getByText } = render(<BatteryScreen navigation={mockNavigation as never} />);
    expect(getByText('Low Power Mode')).toBeTruthy();
    expect(getByText('Battery Percentage')).toBeTruthy();
  });

  // Switch order in the Toggles section: [0] Low Power Mode, [1] Battery Percentage
  it('toggling Low Power Mode persists to settings (on)', () => {
    const { getAllByRole } = render(<BatteryScreen navigation={mockNavigation as never} />);
    const switches = getAllByRole('switch');
    fireEvent.press(switches[0]);
    expect(mockUpdate).toHaveBeenCalledWith('lowPowerMode', true);
  });

  it('toggling Battery Percentage persists to settings (off)', () => {
    const { getAllByRole } = render(<BatteryScreen navigation={mockNavigation as never} />);
    const switches = getAllByRole('switch');
    fireEvent.press(switches[1]);
    expect(mockUpdate).toHaveBeenCalledWith('batteryPercentage', false);
  });
});
