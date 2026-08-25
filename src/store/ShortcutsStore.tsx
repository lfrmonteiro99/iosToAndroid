import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import type { Shortcut, ShortcutAction } from '../utils/shortcutsDispatch';

/**
 * ShortcutsStore (#782, parte de #629): lista de atalhos do utilizador,
 * persistida em AsyncStorage. Segue o mesmo padrão de `BookmarksStore.tsx`
 * (Context + Provider + hook, sanitização na leitura).
 */

const STORAGE_KEY = '@iostoandroid/shortcuts';

interface ShortcutsContextValue {
  shortcuts: Shortcut[];
  addShortcut: (shortcut: Shortcut) => void;
  removeShortcut: (id: string) => void;
  isReady: boolean;
}

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

function isValidAction(value: unknown): value is ShortcutAction {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as ShortcutAction).id === 'string' &&
    typeof (value as ShortcutAction).type === 'string' &&
    typeof (value as ShortcutAction).label === 'string'
  );
}

function isValidShortcut(value: unknown): value is Shortcut {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Shortcut;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.actions) &&
    candidate.actions.every(isValidAction)
  );
}

export function ShortcutsProvider({ children }: { children: React.ReactNode }) {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            // Descarta entradas malformadas para que um payload corrompido
            // não parta a lista inteira.
            setShortcuts(parsed.filter(isValidShortcut));
          }
        } catch (e) {
          logger.warn('ShortcutsStore', 'failed to parse stored shortcuts', e);
        }
      }
      setIsReady(true);
    })();
  }, []);

  useEffect(() => {
    if (isReady) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
  }, [shortcuts, isReady]);

  const addShortcut = useCallback((shortcut: Shortcut) => {
    setShortcuts((prev) => [...prev.filter((s) => s.id !== shortcut.id), shortcut]);
  }, []);

  const removeShortcut = useCallback((id: string) => {
    setShortcuts((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const value = useMemo(
    () => ({ shortcuts, addShortcut, removeShortcut, isReady }),
    [shortcuts, addShortcut, removeShortcut, isReady],
  );

  return <ShortcutsContext.Provider value={value}>{children}</ShortcutsContext.Provider>;
}

export function useShortcuts() {
  const ctx = useContext(ShortcutsContext);
  if (!ctx) throw new Error('useShortcuts must be used within ShortcutsProvider');
  return ctx;
}
