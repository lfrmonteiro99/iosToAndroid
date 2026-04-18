import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { SpotlightSearchScreen } from '../SpotlightSearchScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };
const mockRoute = { params: {} };

describe('SpotlightSearchScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<SpotlightSearchScreen navigation={mockNavigation} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders Search title', () => {
    const { getByText } = render(<SpotlightSearchScreen navigation={mockNavigation} />);
    expect(getByText('Search')).toBeTruthy();
  });

  it('renders search bar', () => {
    const { getByPlaceholderText } = render(<SpotlightSearchScreen navigation={mockNavigation} />);
    expect(getByPlaceholderText('Search')).toBeTruthy();
  });

  it('renders Back button', () => {
    const { getByText } = render(<SpotlightSearchScreen navigation={mockNavigation} />);
    expect(getByText('Back')).toBeTruthy();
  });

  it('pressing Back calls navigation.goBack', () => {
    const nav = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };
    const { getByLabelText } = render(<SpotlightSearchScreen navigation={nav} />);
    fireEvent.press(getByLabelText('Back'));
    expect(nav.goBack).toHaveBeenCalled();
  });
});
