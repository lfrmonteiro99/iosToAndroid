/**
 * React binding for the timer primitive (#784).
 *
 * The state lives in `src/store/timerStore.ts` at module scope; this hook only
 * subscribes to it so the Clock screen re-renders on each tick. Keeping the
 * binding this thin is what lets `startTimer`/`stopTimer` be called from
 * outside any component (a future shortcut primitive) with the UI still in sync.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { getTimerState, hydrateTimer, subscribeToTimer, TimerState } from '../store/timerStore';

export function useTimer(): TimerState {
  const state = useSyncExternalStore(subscribeToTimer, getTimerState, getTimerState);

  useEffect(() => {
    hydrateTimer().catch(() => {});
  }, []);

  return state;
}
