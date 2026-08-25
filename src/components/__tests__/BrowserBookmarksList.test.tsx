import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { BrowserBookmarksList } from '../BrowserBookmarksList';
import type { Bookmark } from '../../store/BookmarksStore';

const mockOnClose = jest.fn();
const mockOnNavigate = jest.fn();

const sample: Bookmark[] = [
  { id: 'b1', url: 'https://example.com/a', title: 'Page A', createdAt: 1 },
  { id: 'b2', url: 'https://example.com/b', title: 'Page B', createdAt: 2 },
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BrowserBookmarksList', () => {
  it('renders all seeded bookmarks when visible', () => {
    const { getByText } = render(
      <BrowserBookmarksList visible bookmarks={sample} onClose={mockOnClose} onNavigate={mockOnNavigate} />,
    );

    expect(getByText('Page A')).toBeTruthy();
    expect(getByText('https://example.com/a')).toBeTruthy();
    expect(getByText('Page B')).toBeTruthy();
    expect(getByText('2 items')).toBeTruthy();
  });

  it('renders nothing usable when visible={false} (the inverse of the fix)', () => {
    const { queryByText, queryByLabelText } = render(
      <BrowserBookmarksList visible={false} bookmarks={sample} onClose={mockOnClose} onNavigate={mockOnNavigate} />,
    );

    expect(queryByText('Page A')).toBeNull();
    expect(queryByText('Page B')).toBeNull();
    expect(queryByLabelText('Close Bookmarks')).toBeNull();
  });

  it('shows an empty state when there are no bookmarks', () => {
    const { getByText, queryByText } = render(
      <BrowserBookmarksList visible bookmarks={[]} onClose={mockOnClose} onNavigate={mockOnNavigate} />,
    );

    expect(getByText('No bookmarks yet')).toBeTruthy();
    expect(getByText('0 items')).toBeTruthy();
    expect(queryByText('https://example.com/a')).toBeNull();
  });

  it('navigates to the tapped bookmark and closes the modal', () => {
    const { getByText } = render(
      <BrowserBookmarksList visible bookmarks={sample} onClose={mockOnClose} onNavigate={mockOnNavigate} />,
    );

    fireEvent.press(getByText('Page A'));

    expect(mockOnNavigate).toHaveBeenCalledTimes(1);
    expect(mockOnNavigate).toHaveBeenCalledWith('https://example.com/a');
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('double-tap on the same bookmark calls onNavigate twice (repetition guard)', () => {
    const { getByText } = render(
      <BrowserBookmarksList visible bookmarks={sample} onClose={mockOnClose} onNavigate={mockOnNavigate} />,
    );

    fireEvent.press(getByText('Page B'));
    fireEvent.press(getByText('Page B'));

    expect(mockOnNavigate).toHaveBeenCalledTimes(2);
    expect(mockOnClose).toHaveBeenCalledTimes(2);
  });

  it('the Close button calls onClose', () => {
    const { getByLabelText } = render(
      <BrowserBookmarksList visible bookmarks={sample} onClose={mockOnClose} onNavigate={mockOnNavigate} />,
    );

    fireEvent.press(getByLabelText('Close Bookmarks'));

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockOnNavigate).not.toHaveBeenCalled();
  });
});
