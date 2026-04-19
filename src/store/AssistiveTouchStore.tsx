import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@iostoandroid/assistive_touch';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AssistiveAction =
  | 'openMenu'
  | 'home'
  | 'multitask'
  | 'notifications'
  | 'controlCenter'
  | 'spotlight'
  | 'settings'
  | 'reachability'
  | 'hideTemporarily'
  | 'screenshot'
  | 'lock'
  | 'siri'
  | 'none';

export type MenuItemId =
  | 'home'
  | 'multitask'
  | 'notifications'
  | 'controlCenter'
  | 'spotlight'
  | 'settings'
  | 'siri'
  | 'screenshot'
  | 'lock'
  | 'reachability'
  | 'hideTemporarily';

export interface AssistiveTouchState {
  /** Master on/off switch */
  enabled: boolean;
  /** Opacity when idle (0.15 – 1.0) */
  idleOpacity: number;
  /** Button diameter in pt (40 – 60) */
  size: number;
  /** Persisted position — x/y in pt, snapped edge */
  position: { x: number; y: number };
  /** Edge the button snaps to after drag */
  edge: 'left' | 'right';
  /** Action mappings */
  singleTapAction: AssistiveAction;
  doubleTapAction: AssistiveAction;
  longPressAction: AssistiveAction;
  /** Ordered list of menu items shown when openMenu fires */
  menuItems: MenuItemId[];
  /** Improvement toggles */
  autoHideFullscreen: boolean;
  contextAwareMenu: boolean;
  reachabilityOnDoubleTap: boolean;
  hapticFeedback: boolean;
}

const DEFAULT_STATE: AssistiveTouchState = {
  enabled: false,
  idleOpacity: 0.5,
  size: 46,
  position: { x: 0, y: 300 },
  edge: 'right',
  singleTapAction: 'openMenu',
  doubleTapAction: 'multitask',
  longPressAction: 'hideTemporarily',
  menuItems: ['home', 'multitask', 'notifications', 'controlCenter', 'spotlight', 'settings'],
  autoHideFullscreen: true,
  contextAwareMenu: true,
  reachabilityOnDoubleTap: false,
  hapticFeedback: true,
};

// ─── Context ────────────────────────────────────────────────────────────────

interface AssistiveTouchContextValue extends AssistiveTouchState {
  update: (patch: Partial<AssistiveTouchState>) => void;
  setPosition: (x: number, y: number, edge: 'left' | 'right') => void;
  /** Triggered by long-press action — hides for `ms` then reveals again. */
  hideTemporarily: (ms?: number) => void;
  /** True while a temporary hide is active. */
  temporarilyHidden: boolean;
  /** Runtime-only: reachability shifts app content down when true. */
  reachabilityActive: boolean;
  setReachabilityActive: (v: boolean) => void;
}

const AssistiveTouchContext = createContext<AssistiveTouchContextValue | null>(null);

export function useAssistiveTouch(): AssistiveTouchContextValue {
  const ctx = useContext(AssistiveTouchContext);
  if (!ctx) throw new Error('useAssistiveTouch must be used inside AssistiveTouchProvider');
  return ctx;
}

// ─── Provider ───────────────────────────────────────────────────────────────

export function AssistiveTouchProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AssistiveTouchState>(DEFAULT_STATE);
  const [isReady, setIsReady] = useState(false);
  const [temporarilyHidden, setTemporarilyHidden] = useState(false);
  const [reachabilityActive, setReachabilityActive] = useState(false);

  // Load persisted state
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Partial<AssistiveTouchState>;
          setState((prev) => ({ ...prev, ...parsed }));
        } catch { /* ignore malformed */ }
      }
      setIsReady(true);
    });
  }, []);

  // Persist on every change (skip initial load)
  useEffect(() => {
    if (isReady) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, isReady]);

  const update = useCallback((patch: Partial<AssistiveTouchState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setPosition = useCallback((x: number, y: number, edge: 'left' | 'right') => {
    setState((prev) => ({ ...prev, position: { x, y }, edge }));
  }, []);

  const hideTemporarily = useCallback((ms: number = 10000) => {
    setTemporarilyHidden(true);
    setTimeout(() => setTemporarilyHidden(false), ms);
  }, []);

  const value = useMemo<AssistiveTouchContextValue>(
    () => ({
      ...state,
      update,
      setPosition,
      hideTemporarily,
      temporarilyHidden,
      reachabilityActive,
      setReachabilityActive,
    }),
    [state, update, setPosition, hideTemporarily, temporarilyHidden, reachabilityActive],
  );

  return <AssistiveTouchContext.Provider value={value}>{children}</AssistiveTouchContext.Provider>;
}
