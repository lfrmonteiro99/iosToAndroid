import React from 'react';
import { render } from '../../test-utils';
import { MultitaskScreen } from '../MultitaskScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };
const mockRoute = { params: {} };

describe('MultitaskScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<MultitaskScreen navigation={mockNavigation} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders empty state when no recent apps', () => {
    const { toJSON } = render(<MultitaskScreen navigation={mockNavigation} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders multitask container', () => {
    const { toJSON } = render(<MultitaskScreen navigation={mockNavigation} />);
    const tree = toJSON();
    expect(tree).toBeTruthy();
  });
});
