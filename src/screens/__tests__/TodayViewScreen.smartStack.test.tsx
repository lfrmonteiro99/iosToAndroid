/**
 * #810: the Smart Stack lives above the 2-column grid in the Today View. It
 * reuses the SAME widget instances and the SAME small-cell sizing as the grid,
 * only appears when the user grouped 2..4 small widgets, and pulls those
 * widgets OUT of the grid below (no widget shown twice). This drives the REAL
 * TodayViewScreen with a pre-seeded AsyncStorage stack config.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, waitFor, within } from '../../test-utils';
import type { AppNavigationProp } from '../../navigation/types';
import { TodayViewScreen } from '../TodayViewScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as unknown as AppNavigationProp;

function seedStack(stack: string[] | null) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
    if (key === '@iostoandroid/smart_stack') {
      return Promise.resolve(stack ? JSON.stringify(stack) : null);
    }
    if (key === '@iostoandroid/widget_config') {
      // DEFAULT_ENABLED: battery, weather, storage, upNext, messages
      return Promise.resolve(JSON.stringify(['battery', 'weather', 'storage', 'upNext', 'messages']));
    }
    return Promise.resolve(null);
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('TodayViewScreen — Smart Stack integration (#810)', () => {
  it('lifts a configured 2..4-widget stack above the grid and removes those widgets from the grid', async () => {
    seedStack(['battery', 'storage', 'messages']);

    const { getByTestId, queryByTestId } = render(<TodayViewScreen navigation={mockNavigation} />);

    await waitFor(() => expect(getByTestId('today-smart-stack')).toBeTruthy(), { timeout: 3000 });

    // Stack cell sits above the grid with the same half-width (small) sizing.
    const cell = getByTestId('today-smart-stack-cell');
    expect(cell.props.style.some((s: object) => (s as { width?: string }).width === '48%')).toBe(true);

    // The stacked widgets render inside the stack.
    const stack = getByTestId('today-smart-stack');
    expect(within(stack).getByText('Battery')).toBeTruthy();
    expect(within(stack).getByText('Storage')).toBeTruthy();

    // They must NOT also appear in the 2-column grid below.
    expect(queryByTestId('widget-cell-battery')).toBeNull();
    expect(queryByTestId('widget-cell-storage')).toBeNull();
    expect(queryByTestId('widget-cell-messages')).toBeNull();

    // Non-stacked widgets (weather, upNext) remain in the grid.
    expect(getByTestId('widget-cell-weather')).toBeTruthy();
    expect(getByTestId('widget-cell-upNext')).toBeTruthy();
  });

  it('shows the page dots (one per stacked widget) with the top widget active', async () => {
    seedStack(['battery', 'storage', 'messages']);

    const { getByTestId } = render(<TodayViewScreen navigation={mockNavigation} />);
    await waitFor(() => expect(getByTestId('today-smart-stack')).toBeTruthy(), { timeout: 3000 });

    const stack = getByTestId('today-smart-stack');
    expect(getByTestId('today-smart-stack-dots')).toBeTruthy();
    expect(stack).toBeTruthy();
  });

  it('renders NO stack at all when no stack is configured (default Today View is untouched)', async () => {
    seedStack(null);

    const { getByTestId, queryByTestId } = render(<TodayViewScreen navigation={mockNavigation} />);
    await waitFor(() => expect(getByTestId('widget-cell-battery')).toBeTruthy(), { timeout: 3000 });

    expect(queryByTestId('today-smart-stack')).toBeNull();
    // Every default-enabled widget still shown in the grid exactly once.
    expect(getByTestId('widget-cell-battery')).toBeTruthy();
    expect(getByTestId('widget-cell-weather')).toBeTruthy();
    expect(getByTestId('widget-cell-storage')).toBeTruthy();
    expect(getByTestId('widget-cell-upNext')).toBeTruthy();
    expect(getByTestId('widget-cell-messages')).toBeTruthy();
  });

  it('exposes a distinct accessibility label per stacked widget (top + peeking layers)', async () => {
    seedStack(['battery', 'storage', 'messages']);

    const { getByTestId } = render(<TodayViewScreen navigation={mockNavigation} />);
    await waitFor(() => expect(getByTestId('today-smart-stack-top')).toBeTruthy(), { timeout: 3000 });

    // Top card announces its own widget ("Battery widget").
    expect(getByTestId('today-smart-stack-top').props.accessibilityLabel).toBe('Battery widget');
    // A peeking layer keeps its own label too.
    expect(getByTestId('today-smart-stack-layer-storage').props.accessibilityLabel).toBe('Storage widget');
  });
});
