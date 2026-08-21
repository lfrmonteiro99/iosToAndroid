import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const STORAGE_KEY = '@iostoandroid/reading_list';

export interface ReadingListItem {
  id: string;
  url: string;
  title: string;
  addedAt: number;
  isRead: boolean;
}

interface ReadingListContextValue {
  items: ReadingListItem[];
  addItem: (url: string, title: string) => void;
  removeItem: (id: string) => void;
  markRead: (id: string, isRead: boolean) => void;
  isReady: boolean;
}

const ReadingListContext = createContext<ReadingListContextValue | null>(null);

export function ReadingListProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ReadingListItem[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            // Drop malformed entries so a corrupt payload can't break the list.
            setItems(
              parsed.filter(
                (it): it is ReadingListItem =>
                  it && typeof it.id === 'string' && typeof it.url === 'string',
              ),
            );
          }
        } catch (e) {
          logger.warn('ReadingListStore', 'failed to parse stored reading list', e);
        }
      }
      setIsReady(true);
    })();
  }, []);

  useEffect(() => {
    if (isReady) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, isReady]);

  const addItem = useCallback((url: string, title: string) => {
    if (!url) return;
    setItems((prev) => {
      // De-duplicate by URL: re-adding an existing page moves it to the top
      // and marks it unread, matching Safari's Reading List behaviour.
      const without = prev.filter((it) => it.url !== url);
      return [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          url,
          title: title || url,
          addedAt: Date.now(),
          isRead: false,
        },
        ...without,
      ];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const markRead = useCallback((id: string, isRead: boolean) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, isRead } : it)));
  }, []);

  const value = useMemo(
    () => ({ items, addItem, removeItem, markRead, isReady }),
    [items, addItem, removeItem, markRead, isReady],
  );

  return <ReadingListContext.Provider value={value}>{children}</ReadingListContext.Provider>;
}

export function useReadingList() {
  const ctx = useContext(ReadingListContext);
  if (!ctx) throw new Error('useReadingList must be used within ReadingListProvider');
  return ctx;
}
