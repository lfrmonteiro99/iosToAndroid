import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const STORAGE_KEY = '@iostoandroid/bookmarks';

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  createdAt: number;
}

interface BookmarksContextValue {
  bookmarks: Bookmark[];
  addBookmark: (url: string, title: string) => void;
  removeBookmark: (id: string) => void;
  isBookmarked: (url: string) => boolean;
  isReady: boolean;
}

const BookmarksContext = createContext<BookmarksContextValue | null>(null);

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function BookmarksProvider({ children }: { children: React.ReactNode }) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            // Drop malformed entries so a corrupt payload can't break the list.
            setBookmarks(
              parsed.filter(
                (bm): bm is Bookmark =>
                  bm && typeof bm.id === 'string' && typeof bm.url === 'string',
              ),
            );
          }
        } catch (e) {
          logger.warn('BookmarksStore', 'failed to parse stored bookmarks', e);
        }
      }
      setIsReady(true);
    })();
  }, []);

  useEffect(() => {
    if (isReady) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  }, [bookmarks, isReady]);

  const addBookmark = useCallback((url: string, title: string) => {
    if (!url) return;
    setBookmarks((prev) => {
      // De-duplicate by URL: re-adding an existing page moves it to the top,
      // matching Safari's bookmark behaviour.
      const without = prev.filter((bm) => bm.url !== url);
      return [
        {
          id: generateId(),
          url,
          title: title || url,
          createdAt: Date.now(),
        },
        ...without,
      ];
    });
  }, []);

  const removeBookmark = useCallback((id: string) => {
    setBookmarks((prev) => prev.filter((bm) => bm.id !== id));
  }, []);

  const isBookmarked = useCallback(
    (url: string) => bookmarks.some((bm) => bm.url === url),
    [bookmarks],
  );

  const value = useMemo(
    () => ({ bookmarks, addBookmark, removeBookmark, isBookmarked, isReady }),
    [bookmarks, addBookmark, removeBookmark, isBookmarked, isReady],
  );

  return <BookmarksContext.Provider value={value}>{children}</BookmarksContext.Provider>;
}

export function useBookmarks() {
  const ctx = useContext(BookmarksContext);
  if (!ctx) throw new Error('useBookmarks must be used within BookmarksProvider');
  return ctx;
}
