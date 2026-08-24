import React from 'react';
import { render, fireEvent } from '../../../test-utils';
import { PerformanceProfileScreen } from '../PerformanceProfileScreen';
import { getPerformanceProfileTriggers } from '../../../utils/performanceProfile';

const mockUpdate = jest.fn();
const mockUpdateMany = jest.fn();

jest.mock('../../../store/SettingsStore', () => ({
  useSettings: jest.fn(() => ({
    settings: { performanceProfile: 'normal' },
    update: mockUpdate,
    updateMany: mockUpdateMany,
  })),
  SettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

describe('PerformanceProfileScreen (#631 child: profile picker + triggers)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useSettings } = require('../../../store/SettingsStore');
    (useSettings as jest.Mock).mockReturnValue({
      settings: { performanceProfile: 'normal' },
      update: mockUpdate,
      updateMany: mockUpdateMany,
    });
  });

  it('renders the five profile labels in the segmented control', () => {
    const { getAllByText } = render(<PerformanceProfileScreen />);
    expect(getAllByText('Normal').length).toBeGreaterThan(0);
    expect(getAllByText('Performance').length).toBeGreaterThan(0);
    expect(getAllByText('Saver').length).toBeGreaterThan(0);
    expect(getAllByText('Sleep').length).toBeGreaterThan(0);
    expect(getAllByText('Travel').length).toBeGreaterThan(0);
  });

  it('renders the description of the currently selected profile', () => {
    const { getByText } = render(<PerformanceProfileScreen />);
    // 'normal' baseline description is the first profile def's description.
    expect(getByText(/Balanced defaults/)).toBeTruthy();
  });

  // --- Core behaviour: selecting a profile records it AND fires its triggers ---

  it('selecting Saver records the profile and applies its trigger patch', () => {
    const { getByText } = render(<PerformanceProfileScreen />);

    fireEvent.press(getByText('Saver'));

    expect(mockUpdate).toHaveBeenCalledWith('performanceProfile', 'saver');
    expect(mockUpdateMany).toHaveBeenCalledWith(getPerformanceProfileTriggers('saver'));
  });

  it('selecting Performance records the profile and its (none-low-power) patch', () => {
    const { getByText } = render(<PerformanceProfileScreen />);

    fireEvent.press(getByText('Performance'));

    expect(mockUpdate).toHaveBeenCalledWith('performanceProfile', 'performance');
    expect(mockUpdateMany).toHaveBeenCalledWith(getPerformanceProfileTriggers('performance'));
  });

  it('selecting Travel records the profile and its location/low-power patch', () => {
    const { getByText } = render(<PerformanceProfileScreen />);

    fireEvent.press(getByText('Travel'));

    expect(mockUpdate).toHaveBeenCalledWith('performanceProfile', 'travel');
    expect(mockUpdateMany).toHaveBeenCalledWith(getPerformanceProfileTriggers('travel'));
  });

  // --- Inverse / double-tap edge cases ---

  it('selecting Normal still records it (baseline) and applies an empty patch', () => {
    const { getAllByText } = render(<PerformanceProfileScreen />);

    fireEvent.press(getAllByText('Normal')[0]);

    expect(mockUpdate).toHaveBeenCalledWith('performanceProfile', 'normal');
    expect(mockUpdateMany).toHaveBeenCalledWith({});
  });

  it('a profile can be reselected (double-tap) and fires its triggers both times', () => {
    const { getByText } = render(<PerformanceProfileScreen />);

    fireEvent.press(getByText('Sleep'));
    fireEvent.press(getByText('Sleep'));

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenNthCalledWith(1, 'performanceProfile', 'sleep');
    expect(mockUpdate).toHaveBeenNthCalledWith(2, 'performanceProfile', 'sleep');
    // Triggers fire on every selection, not just the first — double-tap is a
    // recurring defect in this codebase and must not be swallowed.
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockUpdateMany).toHaveBeenNthCalledWith(2, getPerformanceProfileTriggers('sleep'));
  });

  // --- Reads the initial selection from settings ---

  it('reflects a pre-existing profile from settings as the selected index', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useSettings } = require('../../../store/SettingsStore');
    (useSettings as jest.Mock).mockReturnValue({
      settings: { performanceProfile: 'travel' },
      update: mockUpdate,
      updateMany: mockUpdateMany,
    });

    const { getByText } = render(<PerformanceProfileScreen />);
    // Travel is the last label; its description must be the one shown.
    expect(getByText(/Away from home/)).toBeTruthy();
  });
});
