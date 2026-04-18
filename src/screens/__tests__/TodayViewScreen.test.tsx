import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { TodayViewScreen } from '../TodayViewScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };
const mockRoute = { params: {} };

describe('TodayViewScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<TodayViewScreen navigation={mockNavigation} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders today date', () => {
    const { toJSON } = render(<TodayViewScreen navigation={mockNavigation} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders widget content area', () => {
    const { toJSON } = render(<TodayViewScreen navigation={mockNavigation} />);
    const tree = toJSON();
    expect(tree).toBeTruthy();
  });

  it('renders Edit Widgets button', () => {
    const { getByText } = render(<TodayViewScreen navigation={mockNavigation} />);
    expect(getByText('Edit Widgets')).toBeTruthy();
  });

  it('pressing Edit Widgets shows done button', () => {
    const { getByText } = render(<TodayViewScreen navigation={mockNavigation} />);
    fireEvent.press(getByText('Edit Widgets'));
    expect(getByText('Done')).toBeTruthy();
  });
});
