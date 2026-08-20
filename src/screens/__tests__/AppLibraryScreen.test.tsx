import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { AppLibraryScreen } from '../AppLibraryScreen';

const nav = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as never;

beforeEach(() => jest.clearAllMocks());

describe('AppLibraryScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<AppLibraryScreen navigation={nav} />);
    expect(toJSON()).toBeTruthy();
  });

  it('shows the App Library search input', () => {
    const { getByPlaceholderText } = render(<AppLibraryScreen navigation={nav} />);
    expect(getByPlaceholderText('App Library')).toBeTruthy();
  });

  it('typing activates search results view without crashing', () => {
    const { getByPlaceholderText } = render(<AppLibraryScreen navigation={nav} />);
    fireEvent.changeText(getByPlaceholderText('App Library'), 'Settings');
    // Re-query after state update — no crash is the assertion
    expect(getByPlaceholderText('App Library')).toBeTruthy();
  });

  it('clearing search returns to category view without crashing', () => {
    const { getByPlaceholderText } = render(<AppLibraryScreen navigation={nav} />);
    fireEvent.changeText(getByPlaceholderText('App Library'), 'foo');
    fireEvent.changeText(getByPlaceholderText('App Library'), '');
    expect(getByPlaceholderText('App Library')).toBeTruthy();
  });
});
