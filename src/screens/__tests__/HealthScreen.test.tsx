import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { HealthScreen } from '../HealthScreen';
import { useHealth } from '../../store/HealthStore';

jest.mock('../../store/HealthStore', () => {
  const actual = jest.requireActual('../../store/HealthStore');
  return { ...actual, useHealth: jest.fn() };
});

const useHealthMock = useHealth as jest.Mock;

const base = {
  todaySteps: 0,
  isPedometerAvailable: true,
  permissionGranted: null as boolean | null,
  requestActivityPermission: jest.fn(async () => false),
  isReady: true,
};

describe('HealthScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useHealthMock.mockReturnValue({ ...base });
  });

  it('renders Health as its title', () => {
    const { getByText } = render(<HealthScreen />);
    expect(getByText('Health')).toBeTruthy();
  });

  it('shows the Grant Activity Permission button when ungranted', () => {
    const { getByText } = render(<HealthScreen />);
    expect(getByText('Grant Activity Permission')).toBeTruthy();
  });

  it('shows an em dash instead of a number before permission is granted', () => {
    useHealthMock.mockReturnValue({ ...base, todaySteps: 1234, permissionGranted: null });
    const { getByText, queryByText } = render(<HealthScreen />);
    expect(getByText('—')).toBeTruthy();
    expect(queryByText('1234')).toBeNull();
  });

  it('shows the real step count once permission is granted, and hides the button', () => {
    useHealthMock.mockReturnValue({ ...base, todaySteps: 1234, permissionGranted: true });
    const { getByText, queryByText } = render(<HealthScreen />);
    expect(getByText('1234')).toBeTruthy();
    expect(queryByText('Grant Activity Permission')).toBeNull();
    expect(queryByText('—')).toBeNull();
  });

  it('shows 0 (not an em dash) when granted and the user has not moved', () => {
    useHealthMock.mockReturnValue({ ...base, todaySteps: 0, permissionGranted: true });
    const { getByText, queryByText } = render(<HealthScreen />);
    expect(getByText('0')).toBeTruthy();
    expect(queryByText('—')).toBeNull();
  });

  it('never offers a permission when the device has no pedometer', () => {
    useHealthMock.mockReturnValue({ ...base, isPedometerAvailable: false, permissionGranted: null });
    const { getByText, queryByText } = render(<HealthScreen />);
    expect(queryByText('Grant Activity Permission')).toBeNull();
    expect(getByText('Step counting is not available on this device')).toBeTruthy();
    expect(getByText('—')).toBeTruthy();
  });

  it('does not offer the permission before the store is ready', () => {
    useHealthMock.mockReturnValue({ ...base, isReady: false });
    const { queryByText } = render(<HealthScreen />);
    expect(queryByText('Grant Activity Permission')).toBeNull();
    expect(queryByText('Step counting is not available on this device')).toBeNull();
  });

  it('presses the button once and requests the permission', () => {
    const requestActivityPermission = jest.fn(async () => true);
    useHealthMock.mockReturnValue({ ...base, requestActivityPermission });
    const { getByText } = render(<HealthScreen />);
    fireEvent.press(getByText('Grant Activity Permission'));
    expect(requestActivityPermission).toHaveBeenCalledTimes(1);
  });

  it('a rapid double tap does not fire two permission requests', () => {
    // CupertinoButton debounces repeated presses (see CupertinoButton.tsx:38-45);
    // this pins the screen to that behaviour so a double tap cannot open two
    // OS dialogs — the recurring double-tap defect in this repo.
    const requestActivityPermission = jest.fn(async () => true);
    useHealthMock.mockReturnValue({ ...base, requestActivityPermission });
    const { getByText } = render(<HealthScreen />);
    const button = getByText('Grant Activity Permission');
    fireEvent.press(button);
    fireEvent.press(button);
    expect(requestActivityPermission).toHaveBeenCalledTimes(1);
  });
});
