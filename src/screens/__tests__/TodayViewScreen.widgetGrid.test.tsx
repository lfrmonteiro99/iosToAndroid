import React from 'react';
import { render, waitFor } from '../../test-utils';
import { TodayViewScreen } from '../TodayViewScreen';
import { Shape } from '../../theme/CupertinoTheme';
import type { AppNavigationProp } from '../../navigation/types';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as unknown as AppNavigationProp;

// Flattens a style array/object the way RN would for assertion purposes.
function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...flattenStyle(s) }), {});
  }
  return (style as Record<string, unknown>) ?? {};
}

describe('TodayViewScreen — widget grid (2-col, sized cards)', () => {
  it('lays out small widgets two-per-row (~48% width) and medium/large widgets full width', async () => {
    const { getByTestId } = render(<TodayViewScreen navigation={mockNavigation} />);

    await waitFor(() => expect(getByTestId('widget-cell-battery')).toBeTruthy());

    // battery and storage default to 'small' -> half width, side by side.
    const battery = flattenStyle(getByTestId('widget-cell-battery').props.style);
    const storage = flattenStyle(getByTestId('widget-cell-storage').props.style);
    expect(battery.width).toBe('48%');
    expect(storage.width).toBe('48%');

    // weather defaults to 'medium' -> full width.
    const weather = flattenStyle(getByTestId('widget-cell-weather').props.style);
    expect(weather.width).toBe('100%');
  });

  it('gives the large-size widget (upNext) more vertical room than small/medium cards', async () => {
    const { getByTestId } = render(<TodayViewScreen navigation={mockNavigation} />);

    await waitFor(() => expect(getByTestId('widget-cell-upNext')).toBeTruthy());

    const upNext = flattenStyle(getByTestId('widget-cell-upNext').props.style);
    const weather = flattenStyle(getByTestId('widget-cell-weather').props.style);

    expect(upNext.width).toBe('100%');
    expect(Number(upNext.minHeight)).toBeGreaterThan(Number(weather.minHeight) || 0);
  });

  it('renders widget cards with the widgetSmall squircle radius token (22), not the old hardcoded 20', async () => {
    const { getByTestId } = render(<TodayViewScreen navigation={mockNavigation} />);

    await waitFor(() => expect(getByTestId('widget-card-battery')).toBeTruthy());

    const cardStyle = flattenStyle(getByTestId('widget-card-battery').props.style);

    expect(cardStyle.borderRadius).toBe(Shape.widgetSmall.radius);
    expect(Shape.widgetSmall.radius).toBe(22);
  });
});
