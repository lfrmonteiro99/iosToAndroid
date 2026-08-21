import React, { useEffect } from 'react';
import { render, fireEvent, act } from '../../test-utils';
import { BrowserReadingList } from '../BrowserReadingList';
import { useReadingList } from '../../store/ReadingListStore';

const mockOnClose = jest.fn();
const mockOnOpen = jest.fn();

// Harness: seeds the reading list via the real store, then renders the modal.
// This exercises the actual provider→modal data flow (no duplicated logic).
function Harness({ seed }: { seed: { url: string; title: string }[] }) {
  const { addItem } = useReadingList();
  useEffect(() => {
    seed.forEach((s) => addItem(s.url, s.title));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <BrowserReadingList visible onClose={mockOnClose} onOpenItem={mockOnOpen} />;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BrowserReadingList', () => {
  it('renders an empty state when there are no saved items', () => {
    const { queryByText, getByText } = render(
      <BrowserReadingList visible onClose={mockOnClose} onOpenItem={mockOnOpen} />,
    );

    expect(getByText('No saved pages yet')).toBeTruthy();
    // Header still shows the 0-items count.
    expect(getByText('0 items')).toBeTruthy();
    expect(queryByText('https://example.com/a')).toBeNull();
  });

  it('renders saved items with their title and url', async () => {
    const { getByText } = render(
      <Harness seed={[{ url: 'https://example.com/a', title: 'Article A' }]} />,
    );

    await act(async () => {});

    expect(getByText('Article A')).toBeTruthy();
    expect(getByText('https://example.com/a')).toBeTruthy();
    // New items are unread → a "Read" action is offered.
    expect(getByText('Read')).toBeTruthy();
  });

  it('toggles an item from unread to read and back', async () => {
    const { getByText, queryByText } = render(
      <Harness seed={[{ url: 'https://example.com/a', title: 'Article A' }]} />,
    );
    await act(async () => {});

    // Starts unread: "Read" action present, "Unread" absent.
    expect(getByText('Read')).toBeTruthy();

    fireEvent.press(getByText('Read'));
    await act(async () => {});

    // Now read: "Unread" action present, "Read" gone.
    expect(getByText('Unread')).toBeTruthy();
    expect(queryByText('Read')).toBeNull();

    fireEvent.press(getByText('Unread'));
    await act(async () => {});

    expect(getByText('Read')).toBeTruthy();
  });

  it('navigates to the item and closes the modal when an item is tapped', async () => {
    const { getByText } = render(
      <Harness seed={[{ url: 'https://example.com/a', title: 'Article A' }]} />,
    );
    await act(async () => {});

    fireEvent.press(getByText('Article A'));

    expect(mockOnOpen).toHaveBeenCalledTimes(1);
    expect(mockOnOpen.mock.calls[0][0].url).toBe('https://example.com/a');
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('removes an item when the trash action is pressed', async () => {
    const { getByLabelText, queryByText, getByText } = render(
      <Harness seed={[{ url: 'https://example.com/a', title: 'Article A' }]} />,
    );
    await act(async () => {});

    fireEvent.press(getByLabelText('Remove Article A from reading list'));
    await act(async () => {});

    // Item gone → empty state, header back to 0.
    expect(queryByText('Article A')).toBeNull();
    expect(getByText('0 items')).toBeTruthy();
  });

  it('renders multiple items independently and keeps per-item read state', async () => {
    const { getByText, queryByText, getAllByText } = render(
      <Harness
        seed={[
          { url: 'https://example.com/a', title: 'Article A' },
          { url: 'https://example.com/b', title: 'Article B' },
        ]}
      />,
    );
    await act(async () => {});

    expect(getByText('Article A')).toBeTruthy();
    expect(getByText('Article B')).toBeTruthy();

    // Mark only A as read (first "Read" action belongs to the first item).
    fireEvent.press(getAllByText('Read')[0]);
    await act(async () => {});

    // Exactly one "Unread" (A), and B still offers "Read".
    expect(getByText('Unread')).toBeTruthy();
    expect(queryByText('Read')).toBeTruthy();
  });
});
