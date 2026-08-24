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
  stepHistory: [] as { date: string; steps: number }[],
};

// A fixed fixture: 3 consecutive days in the same ISO week and month, so the
// aggregations diverge — Daily => 3 buckets, Weekly => 1, Monthly => 1.
const THREE_DAY_HISTORY = [
  { date: '2026-08-03', steps: 100 }, // Monday
  { date: '2026-08-04', steps: 200 }, // Tuesday
  { date: '2026-08-05', steps: 300 }, // Wednesday
];

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

  it('renders the Trends section, defaulting to Daily with one bar per day', () => {
    useHealthMock.mockReturnValue({ ...base, stepHistory: THREE_DAY_HISTORY });
    const { getByText, getAllByTestId } = render(<HealthScreen />);
    expect(getByText('Trends')).toBeTruthy();
    // Daily aggregation => 3 bars, one per day
    expect(getAllByTestId(/^bar-\d+$/)).toHaveLength(3);
  });

  it('switches Trends between Daily/Weekly/Monthly via the segmented control', () => {
    useHealthMock.mockReturnValue({ ...base, stepHistory: THREE_DAY_HISTORY });
    const { getByText, getAllByTestId } = render(<HealthScreen />);

    // Daily: 3 buckets
    expect(getAllByTestId(/^bar-\d+$/)).toHaveLength(3);

    // Weekly: all 3 days fall in one ISO week => 1 bucket
    fireEvent.press(getByText('Weekly'));
    expect(getAllByTestId(/^bar-\d+$/)).toHaveLength(1);

    // Monthly: all 3 days fall in one month => 1 bucket
    fireEvent.press(getByText('Monthly'));
    expect(getAllByTestId(/^bar-\d+$/)).toHaveLength(1);

    // Back to Daily
    fireEvent.press(getByText('Daily'));
    expect(getAllByTestId(/^bar-\d+$/)).toHaveLength(3);
  });

  it('shows the empty state in Trends when there is no step history', () => {
    useHealthMock.mockReturnValue({ ...base, stepHistory: [] });
    const { queryByTestId, getByText } = render(<HealthScreen />);
    expect(queryByTestId('bar-0')).toBeNull();
    expect(getByText('No data yet')).toBeTruthy();
  });
});
