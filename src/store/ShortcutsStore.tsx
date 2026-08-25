import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import type { Shortcut, ShortcutAction } from '../utils/shortcutsDispatch';

/**
 * ShortcutsStore (#782, parte de #629): lista de atalhos do utilizador,
 * persistida em AsyncStorage. Segue o mesmo padrão de `BookmarksStore.tsx`
 * (Context + Provider + hook, sanitização na leitura).
 *
 * O modelo de dados (Shortcut/ShortcutAction) é canónico em
 * `src/utils/shortcutsDispatch.ts` — o store importa e re-exporta os tipos
 * para que ecrã, dispatcher e store partilhem a mesma definição em vez de a
 * duplicar.
 */

const STORAGE_KEY = '@iostoandroid/shortcuts';

interface ShortcutsContextValue {
  shortcuts: Shortcut[];
  createShortcut: (name: string, icon: string, actions: ShortcutAction[]) => void;
  updateShortcut: (id: string, updates: Partial<Pick<Shortcut, 'name' | 'icon' | 'actions'>>) => void;
  /** Append one primitive to the actions[] of the shortcut being edited (#783). */
  addAction: (shortcutId: string, action: ShortcutAction) => void;
  deleteShortcut: (id: string) => void;
  isReady: boolean;
}

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isShortcutAction(action: unknown): action is ShortcutAction {
  return (
    !!action &&
    typeof action === 'object' &&
    typeof (action as ShortcutAction).type === 'string' &&
    typeof (action as ShortcutAction).payload === 'object'
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
            // Drop malformed entries so a corrupt payload can't break the list.
            setShortcuts(
              parsed.filter(
                (s): s is Shortcut =>
                  s &&
                  typeof s.id === 'string' &&
                  typeof s.name === 'string' &&
                  typeof s.icon === 'string' &&
                  Array.isArray(s.actions) &&
                  s.actions.every(isShortcutAction),
              ),
            );
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

  const createShortcut = useCallback((name: string, icon: string, actions: ShortcutAction[]) => {
    if (!name) return;
    setShortcuts((prev) => [
      ...prev,
      { id: generateId(), name, icon, actions },
    ]);
  }, []);

  const updateShortcut = useCallback(
    (id: string, updates: Partial<Pick<Shortcut, 'name' | 'icon' | 'actions'>>) => {
      setShortcuts((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
    },
    [],
  );

  const deleteShortcut = useCallback((id: string) => {
    setShortcuts((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Append one primitive to the actions[] of the shortcut being edited
  // (#783). A missing id is a no-op, not a crash — and it must NOT fabricate a
  // new shortcut or mutate other entries. We append only; the dispatcher decides
  // what each primitive *does* at run time (#781), so the store stays a dumb
  // append-only list of typed actions.
  const addAction = useCallback((shortcutId: string, action: ShortcutAction) => {
    if (!shortcutId) return;
    setShortcuts((prev) =>
      prev.map((s) =>
        s.id === shortcutId ? { ...s, actions: [...s.actions, action] } : s,
      ),
    );
  }, []);

  const value = useMemo(
    () => ({ shortcuts, createShortcut, updateShortcut, addAction, deleteShortcut, isReady }),
    [shortcuts, createShortcut, updateShortcut, addAction, deleteShortcut, isReady],
  );

  return <ShortcutsContext.Provider value={value}>{children}</ShortcutsContext.Provider>;
}

export function useShortcuts() {
  const ctx = useContext(ShortcutsContext);
  if (!ctx) throw new Error('useShortcuts must be used within ShortcutsProvider');
  return ctx;
}

// Re-export the canonical data model so consumers can import it from either
// the store or the dispatcher without drifting into two definitions.
export type { Shortcut, ShortcutAction } from '../utils/shortcutsDispatch';
