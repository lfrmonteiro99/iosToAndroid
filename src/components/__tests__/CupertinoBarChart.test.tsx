import React from 'react';
import { render } from '../../test-utils';
import { CupertinoBarChart, BarChartDatum } from '../CupertinoBarChart';
import type { RenderResult } from '@testing-library/react-native';

// spacing.sm is 8 in CupertinoTheme; with default height=160 the available plot
// height is 160 - 2*8 = 144. The tallest bar (value === max) should reach 144,
// and every other bar should be proportionally shorter.
const FULL_HEIGHT = 144;

function barHeight(getByTestId: RenderResult['getByTestId'], index: number): number {
  const node = getByTestId(`bar-${index}`);
  // style is an array: [styles.bar, { height, backgroundColor }]
  const style = node.props.style as Array<{ height?: number }>;
  const heightEntry = style.find((s) => typeof s?.height === 'number');
  return heightEntry?.height ?? 0;
}

describe('CupertinoBarChart', () => {
  it('renders one bar per datum, scaled relative to the max value', () => {
    const data: BarChartDatum[] = [
      { label: 'A', value: 10 },
      { label: 'B', value: 20 },
    ];
    const { getByText, getByTestId } = render(<CupertinoBarChart data={data} />);

    // one bar per entry
    expect(getByTestId('bar-0')).toBeTruthy();
    expect(getByTestId('bar-1')).toBeTruthy();
    // labels present
    expect(getByText('A')).toBeTruthy();
    expect(getByText('B')).toBeTruthy();

    const h0 = barHeight(getByTestId, 0);
    const h1 = barHeight(getByTestId, 1);
    expect(h1).toBe(FULL_HEIGHT); // max value touches the top
    expect(h0).toBe(Math.round(0.5 * FULL_HEIGHT)); // value 10 of max 20 => half
  });

  it('renders a single datum at full height', () => {
    const data: BarChartDatum[] = [{ label: 'A', value: 10 }];
    const { getByTestId } = render(<CupertinoBarChart data={data} />);
    const h = barHeight(getByTestId, 0);
    expect(h).toBe(FULL_HEIGHT);
  });

  it('renders CupertinoEmptyState (not a zero-height chart) when data is empty', () => {
    const { queryByTestId, getByText } = render(<CupertinoBarChart data={[]} />);
    expect(queryByTestId('bar-0')).toBeNull();
    expect(getByText('No data yet')).toBeTruthy();
  });

  it('does not divide by zero or produce NaN when all values are 0', () => {
    const data: BarChartDatum[] = [
      { label: 'A', value: 0 },
      { label: 'B', value: 0 },
    ];
    const { getByTestId } = render(<CupertinoBarChart data={data} />);
    const h0 = barHeight(getByTestId, 0);
    const h1 = barHeight(getByTestId, 1);
    expect(Number.isFinite(h0)).toBe(true);
    expect(Number.isNaN(h0)).toBe(false);
    expect(Number.isNaN(h1)).toBe(false);
    // non-negative, at least the minimum sliver
    expect(h0).toBeGreaterThanOrEqual(2);
    expect(h1).toBeGreaterThanOrEqual(2);
  });

  it('clamps negative values to 0 instead of producing a negative height', () => {
    const data: BarChartDatum[] = [
      { label: 'A', value: -50 },
      { label: 'B', value: 10 },
    ];
    const { getByTestId } = render(<CupertinoBarChart data={data} />);
    const h0 = barHeight(getByTestId, 0);
    expect(h0).toBeGreaterThanOrEqual(2); // clamped to the min sliver, never negative
    expect(Number.isNaN(h0)).toBe(false);
  });

  it('uses the provided valueFormatter for the value labels', () => {
    const data: BarChartDatum[] = [{ label: 'A', value: 1234 }];
    const fmt = jest.fn((v: number) => `${v}k`);
    const { getByText } = render(<CupertinoBarChart data={data} valueFormatter={fmt} />);
    expect(fmt).toHaveBeenCalledWith(1234);
    expect(getByText('1234k')).toBeTruthy();
  });

  it('applies a custom barColor', () => {
    const data: BarChartDatum[] = [{ label: 'A', value: 10 }];
    const { getByTestId } = render(<CupertinoBarChart data={data} barColor="#123456" />);
    const node = getByTestId('bar-0');
    const style = node.props.style as Array<{ backgroundColor?: string }>;
    const colorEntry = style.find((s) => typeof s?.backgroundColor === 'string');
    expect(colorEntry?.backgroundColor).toBe('#123456');
  });
});
