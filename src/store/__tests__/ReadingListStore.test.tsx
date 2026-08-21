import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReadingListProvider, useReadingList } from '../ReadingListStore';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ReadingListProvider>{children}</ReadingListProvider>
);

let idCounter = 1000000;

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  jest.spyOn(Date, 'now').mockImplementation(() => ++idCounter);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ReadingListStore', () => {
  it('starts empty and becomes ready after the async read', async () => {
    const { result } = renderHook(() => useReadingList(), { wrapper });
    // Before the async mount resolves, items must already be an array and
    // the provider must signal readiness.
    await act(async () => {});

    expect(result.current.items).toEqual([]);
    expect(result.current.isReady).toBe(true);
  });

  it('addItem() appends a new unread item with generated id/timestamp', async () => {
    const { result } = renderHook(() => useReadingList(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addItem('https://example.com/a', 'Article A');
    });

    expect(result.current.items).toHaveLength(1);
    const item = result.current.items[0];
    expect(item.url).toBe('https://example.com/a');
    expect(item.title).toBe('Article A');
    expect(item.isRead).toBe(false);
    expect(typeof item.id).toBe('string');
    expect(typeof item.addedAt).toBe('number');
  });

  it('addItem() falls back to the URL as title when title is empty', async () => {
    const { result } = renderHook(() => useReadingList(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addItem('https://example.com/b', '');
    });

    expect(result.current.items[0].title).toBe('https://example.com/b');
  });

  it('addItem() ignores a call with no URL', async () => {
    const { result } = renderHook(() => useReadingList(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addItem('', 'No URL');
    });

    expect(result.current.items).toHaveLength(0);
  });

  it('addItem() de-duplicates by URL and re-inserts at the top unread', async () => {
    const { result } = renderHook(() => useReadingList(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addItem('https://example.com/dup', 'First');
    });
    await act(async () => {
      result.current.markRead(result.current.items[0].id, true);
    });
    expect(result.current.items[0].isRead).toBe(true);

    // Re-add the same URL: should not create a second entry.
    await act(async () => {
      result.current.addItem('https://example.com/dup', 'Second');
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].title).toBe('Second');
    expect(result.current.items[0].isRead).toBe(false);
  });

  it('removeItem() removes an item by id', async () => {
    const { result } = renderHook(() => useReadingList(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addItem('https://example.com/r', 'Remove me');
    });
    const id = result.current.items[0].id;

    await act(async () => {
      result.current.removeItem(id);
    });

    expect(result.current.items).toHaveLength(0);
  });

  it('removeItem() is a no-op for an unknown id', async () => {
    const { result } = renderHook(() => useReadingList(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addItem('https://example.com/r2', 'Keep me');
    });

    await act(async () => {
      result.current.removeItem('does-not-exist');
    });

    expect(result.current.items).toHaveLength(1);
  });

  it('markRead() flips the read flag for a given id', async () => {
    const { result } = renderHook(() => useReadingList(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addItem('https://example.com/m', 'Mark me');
    });
    const id = result.current.items[0].id;

    await act(async () => {
      result.current.markRead(id, true);
    });
    expect(result.current.items[0].isRead).toBe(true);

    await act(async () => {
      result.current.markRead(id, false);
    });
    expect(result.current.items[0].isRead).toBe(false);
  });

  it('markRead() is a no-op for an unknown id', async () => {
    const { result } = renderHook(() => useReadingList(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addItem('https://example.com/m2', 'Mark me 2');
    });

    await act(async () => {
      result.current.markRead('unknown', true);
    });

    expect(result.current.items[0].isRead).toBe(false);
  });

  it('persists items to AsyncStorage on change', async () => {
    const { result } = renderHook(() => useReadingList(), { wrapper });
    await act(async () => {});

    (AsyncStorage.setItem as jest.Mock).mockClear();

    await act(async () => {
      result.current.addItem('https://example.com/p', 'Persist me');
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@iostoandroid/reading_list',
      expect.stringContaining('Persist me'),
    );
  });

  it('hydrates items from AsyncStorage on mount', async () => {
    const saved = JSON.stringify([
      {
        id: 'saved-1',
        url: 'https://example.com/saved',
        title: 'Saved Article',
        addedAt: 123,
        isRead: true,
      },
    ]);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(saved);

    const { result } = renderHook(() => useReadingList(), { wrapper });
    await act(async () => {});

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].title).toBe('Saved Article');
    expect(result.current.items[0].isRead).toBe(true);
    expect(result.current.isReady).toBe(true);
  });

  it('ignores a corrupt (non-array) AsyncStorage payload', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('"not-an-array"');

    const { result } = renderHook(() => useReadingList(), { wrapper });
    await act(async () => {});

    expect(result.current.items).toEqual([]);
    expect(result.current.isReady).toBe(true);
  });
});
