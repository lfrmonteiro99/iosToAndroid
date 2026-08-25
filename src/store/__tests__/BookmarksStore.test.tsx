import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BookmarksProvider, useBookmarks } from '../BookmarksStore';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BookmarksProvider>{children}</BookmarksProvider>
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

describe('BookmarksStore', () => {
  it('starts empty and becomes ready after the async read', async () => {
    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await act(async () => {});

    expect(result.current.bookmarks).toEqual([]);
    expect(result.current.isReady).toBe(true);
  });

  it('addBookmark() appends a new bookmark with generated id/timestamp', async () => {
    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addBookmark('https://example.com/a', 'Page A');
    });

    expect(result.current.bookmarks).toHaveLength(1);
    const bm = result.current.bookmarks[0];
    expect(bm.url).toBe('https://example.com/a');
    expect(bm.title).toBe('Page A');
    expect(typeof bm.id).toBe('string');
    expect(typeof bm.createdAt).toBe('number');
  });

  it('addBookmark() falls back to the URL as title when title is empty', async () => {
    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addBookmark('https://example.com/b', '');
    });

    expect(result.current.bookmarks[0].title).toBe('https://example.com/b');
  });

  it('addBookmark() ignores a call with no URL', async () => {
    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addBookmark('', 'No URL');
    });

    expect(result.current.bookmarks).toHaveLength(0);
  });

  it('addBookmark() de-duplicates by URL and re-inserts at the top', async () => {
    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addBookmark('https://example.com/dup', 'First');
    });
    await act(async () => {
      result.current.addBookmark('https://example.com/other', 'Other');
    });
    expect(result.current.bookmarks).toHaveLength(2);

    // Re-add the same URL: should not create a second entry.
    await act(async () => {
      result.current.addBookmark('https://example.com/dup', 'Second');
    });

    expect(result.current.bookmarks).toHaveLength(2);
    expect(result.current.bookmarks[0].url).toBe('https://example.com/dup');
    expect(result.current.bookmarks[0].title).toBe('Second');
  });

  it('isBookmarked() is false before adding and true after', async () => {
    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await act(async () => {});

    expect(result.current.isBookmarked('https://example.com/x')).toBe(false);

    await act(async () => {
      result.current.addBookmark('https://example.com/x', 'X');
    });

    expect(result.current.isBookmarked('https://example.com/x')).toBe(true);
    expect(result.current.isBookmarked('https://example.com/y')).toBe(false);
  });

  it('removeBookmark() removes a bookmark by id', async () => {
    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addBookmark('https://example.com/r', 'Remove me');
    });
    const id = result.current.bookmarks[0].id;

    await act(async () => {
      result.current.removeBookmark(id);
    });

    expect(result.current.bookmarks).toHaveLength(0);
  });

  it('removeBookmark() is a no-op for an unknown id', async () => {
    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addBookmark('https://example.com/r2', 'Keep me');
    });

    await act(async () => {
      result.current.removeBookmark('does-not-exist');
    });

    expect(result.current.bookmarks).toHaveLength(1);
  });

  it('persists bookmarks to AsyncStorage on change', async () => {
    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await act(async () => {});

    (AsyncStorage.setItem as jest.Mock).mockClear();

    await act(async () => {
      result.current.addBookmark('https://example.com/p', 'Persist me');
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@iostoandroid/bookmarks',
      expect.stringContaining('Persist me'),
    );
  });

  it('hydrates bookmarks from AsyncStorage on mount', async () => {
    const saved = JSON.stringify([
      {
        id: 'saved-1',
        url: 'https://example.com/saved',
        title: 'Saved Page',
        createdAt: 123,
      },
    ]);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(saved);

    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await act(async () => {});

    expect(result.current.bookmarks).toHaveLength(1);
    expect(result.current.bookmarks[0].title).toBe('Saved Page');
    expect(result.current.isReady).toBe(true);
  });

  it('ignores a corrupt (non-array) AsyncStorage payload', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('"not-an-array"');

    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await act(async () => {});

    expect(result.current.bookmarks).toEqual([]);
    expect(result.current.isReady).toBe(true);
  });

  it('throws when useBookmarks() is used outside its provider', () => {
    // Render the hook without a wrapper — should throw synchronously on access.
    expect(() => {
      const { result } = renderHook(() => useBookmarks());
      // Access to force the throw if not already thrown at render.
      void result.current;
    }).toThrow();
  });
});
