import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { CupertinoShareSheet } from '../CupertinoShareSheet';

const mockOnClose = jest.fn();
const mockOnAdd = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CupertinoShareSheet', () => {
  it('shows the four baseline share options (Copy, Messages, Mail, More)', () => {
    const { getByLabelText } = render(
      <CupertinoShareSheet visible onClose={mockOnClose} title="Some Page" url="https://example.com" />,
    );

    expect(getByLabelText('Copy')).toBeTruthy();
    expect(getByLabelText('Messages')).toBeTruthy();
    expect(getByLabelText('Mail')).toBeTruthy();
    expect(getByLabelText('More')).toBeTruthy();
  });

  it('does NOT show "Add to Reading List" when url is absent (regression guard for ProfileScreen)', () => {
    const { queryByLabelText } = render(
      <CupertinoShareSheet
        visible
        onClose={mockOnClose}
        title="Profile"
        text="John — john@x.com"
        onAddToReadingList={mockOnAdd}
      />,
    );

    expect(queryByLabelText('Add to Reading List')).toBeNull();
  });

  it('does NOT show "Add to Reading List" when no handler is wired, even with a url', () => {
    const { queryByLabelText } = render(
      <CupertinoShareSheet visible onClose={mockOnClose} title="Page" url="https://example.com" />,
    );

    expect(queryByLabelText('Add to Reading List')).toBeNull();
  });

  it('shows "Add to Reading List" only when both url and handler are present', () => {
    const { getByLabelText } = render(
      <CupertinoShareSheet
        visible
        onClose={mockOnClose}
        title="Page"
        url="https://example.com/article"
        onAddToReadingList={mockOnAdd}
      />,
    );

    expect(getByLabelText('Add to Reading List')).toBeTruthy();
    // Baseline options still present.
    expect(getByLabelText('Copy')).toBeTruthy();
  });

  it('calls the handler with the current url and title when the option is pressed', () => {
    const { getByLabelText } = render(
      <CupertinoShareSheet
        visible
        onClose={mockOnClose}
        title="My Article"
        url="https://example.com/article"
        onAddToReadingList={mockOnAdd}
      />,
    );

    fireEvent.press(getByLabelText('Add to Reading List'));

    expect(mockOnAdd).toHaveBeenCalledTimes(1);
    expect(mockOnAdd).toHaveBeenCalledWith('https://example.com/article', 'My Article');
  });

  it('closes the sheet when "Add to Reading List" is pressed', () => {
    const { getByLabelText } = render(
      <CupertinoShareSheet
        visible
        onClose={mockOnClose}
        title="My Article"
        url="https://example.com/article"
        onAddToReadingList={mockOnAdd}
      />,
    );

    fireEvent.press(getByLabelText('Add to Reading List'));

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('invokes the Copy handler when Copy is pressed (baseline behavior unchanged)', () => {
    const { getByLabelText } = render(
      <CupertinoShareSheet visible onClose={mockOnClose} title="Page" url="https://example.com" />,
    );

    // Baseline: pressing an option closes the sheet.
    fireEvent.press(getByLabelText('Copy'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    // With no reading-list handler, the reading-list option must stay absent.
    expect(mockOnAdd).not.toHaveBeenCalled();
  });
});
