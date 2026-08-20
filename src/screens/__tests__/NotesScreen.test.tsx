import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { NotesScreen } from '../NotesScreen';

const nav = { navigate: jest.fn(), goBack: jest.fn() } as never;

beforeEach(() => jest.clearAllMocks());

describe('NotesScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<NotesScreen navigation={nav} />);
    expect(toJSON()).toBeTruthy();
  });

  it('shows a Search input', () => {
    const { getByPlaceholderText } = render(<NotesScreen navigation={nav} />);
    expect(getByPlaceholderText('Search')).toBeTruthy();
  });

  it('typing in search does not crash', () => {
    const { getByPlaceholderText } = render(<NotesScreen navigation={nav} />);
    expect(() => fireEvent.changeText(getByPlaceholderText('Search'), 'shopping')).not.toThrow();
  });

  it('clearing search does not crash', () => {
    const { getByPlaceholderText } = render(<NotesScreen navigation={nav} />);
    fireEvent.changeText(getByPlaceholderText('Search'), 'grocery');
    expect(() => fireEvent.changeText(getByPlaceholderText('Search'), '')).not.toThrow();
  });
});
