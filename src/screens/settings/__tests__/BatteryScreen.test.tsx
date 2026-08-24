import React from 'react';
import { render, fireEvent, within } from '../../../test-utils';
import { BatteryScreen } from '../BatteryScreen';

const mockUpdate = jest.fn();
const baseSettings = {
  lowPowerMode: false,
  batteryPercentage: true,
  smartBatteryProfile: 'normal',
  autoBatteryProfile: false,
  smartBatteryThreshold: 30,
};

// Settings mutáveis via mock factory: trocar `mockSettings` e re-renderizar
// reflete a mudança (o jest permite variáveis prefixadas com "mock" no factory).
const mockSettings = { ...baseSettings };

jest.mock('../../../store/SettingsStore', () => ({
  useSettings: jest.fn(() => ({ settings: mockSettings, update: mockUpdate })),
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
    // Restaura o perfil base antes de cada teste.
    Object.assign(mockSettings, baseSettings);
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<BatteryScreen navigation={mockNavigation as never} />);
    expect(toJSON()).toBeTruthy();
  });

  // Real interaction: the header back button ("Settings") calls
  // navigation.goBack(). This is the unique occurrence of that text in the tree.
  it('navigates back when the Settings back button is pressed', () => {
    const { getByText } = render(<BatteryScreen navigation={mockNavigation as never} />);
    fireEvent.press(getByText('Settings'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
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

  // ─── Smart Battery Profiles (#631) ─────────────────────────
  it('renders all five profile rows', () => {
    const { getByText } = render(<BatteryScreen navigation={mockNavigation as never} />);
    expect(getByText('Normal')).toBeTruthy();
    expect(getByText('Performance')).toBeTruthy();
    expect(getByText('Extreme Saver')).toBeTruthy();
    expect(getByText('Sleep')).toBeTruthy();
    expect(getByText('Travel')).toBeTruthy();
  });

  it('renders the auto-by-threshold toggle', () => {
    const { getByText } = render(<BatteryScreen navigation={mockNavigation as never} />);
    expect(getByText('Automatic (below threshold)')).toBeTruthy();
  });

  it('shows exactly one checkmark, on the active profile row', () => {
    const { queryAllByTestId, getByTestId } = render(
      <BatteryScreen navigation={mockNavigation as never} />,
    );
    // 'normal' is the active profile in baseSettings
    expect(queryAllByTestId('battery-profile-check')).toHaveLength(1);
    // A checkmark está dentro da linha do perfil activo.
    const normalRow = getByTestId('battery-profile-row-normal');
    expect(within(normalRow).queryByTestId('battery-profile-check')).toBeTruthy();
  });

  it('moves the checkmark to the selected profile when the setting changes', () => {
    const first = render(<BatteryScreen navigation={mockNavigation as never} />);
    expect(first.queryAllByTestId('battery-profile-check')).toHaveLength(1);
    // Troca o perfil activo via o mock mutável e re-renderiza a mesma árvore.
    mockSettings.smartBatteryProfile = 'travel';
    first.rerender(<BatteryScreen navigation={mockNavigation as never} />);
    expect(within(first.getByTestId('battery-profile-row-travel')).queryByTestId('battery-profile-check')).toBeTruthy();
    expect(within(first.getByTestId('battery-profile-row-normal')).queryByTestId('battery-profile-check')).toBeNull();
  });

  it('selecting a profile persists smartBatteryProfile to settings', () => {
    const { getByText } = render(<BatteryScreen navigation={mockNavigation as never} />);
    // A label é filha do Pressable da linha — premir aqui dispara o onPress.
    fireEvent.press(getByText('Extreme Saver'));
    expect(mockUpdate).toHaveBeenCalledWith('smartBatteryProfile', 'extremeSaver');
  });

  it('toggling the auto threshold switch persists autoBatteryProfile', () => {
    const { getAllByRole } = render(<BatteryScreen navigation={mockNavigation as never} />);
    // switches order: [0] Low Power Mode, [1] Battery Percentage, [2] Automatic
    const switches = getAllByRole('switch');
    fireEvent.press(switches[2]);
    expect(mockUpdate).toHaveBeenCalledWith('autoBatteryProfile', true);
  });
});
