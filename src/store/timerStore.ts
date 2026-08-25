/**
 * Countdown-timer primitive (#784, gap exposed by #629).
 *
 * `TimerTab` in `src/screens/ClockScreen.tsx` used to hold duration/remaining/
 * running in local `useState` with an inline `setInterval`, so the countdown was
 * destroyed the moment the Clock screen unmounted and there was no way to start
 * or stop it from outside the component.
 *
 * This module owns that state at module scope, framework-free, in the same shape
 * as the other extracted primitives (`src/actions/primitiveDispatcher.ts`):
 * plain functions callable from anywhere, plus a `subscribe`/`getTimerState`
 * pair that `src/hooks/useTimer.ts` feeds to `useSyncExternalStore`.
 *
 * Two layers of durability, on purpose:
 *  - module-scope state survives unmounting the screen (same JS session), which
 *    is the behaviour the issue asks for;
 *  - AsyncStorage persists `endsAt` as an absolute instant, so a running timer
 *    restored after a process restart resumes at the right remaining seconds
 *    instead of at the value it had when it was written.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { hapticNotification } from '../utils/haptics';

export const TIMER_STORAGE_KEY = '@iostoandroid/timer';

/** iOS Clock offers no timer longer than 24h; used to reject absurd inputs. */
export const MAX_TIMER_SECONDS = 24 * 60 * 60;
export const DEFAULT_TIMER_SECONDS = 300;

export interface TimerState {
  /** Configured countdown length in seconds. */
  duration: number;
  /** Seconds left. Equals `duration` when idle and never negative. */
  remaining: number;
  running: boolean;
}

interface PersistedTimer {
  duration: number;
  remaining: number;
  running: boolean;
  /** Absolute epoch ms at which a running countdown reaches zero. */
  endsAt: number | null;
}

type Listener = () => void;

let state: TimerState = {
  duration: DEFAULT_TIMER_SECONDS,
  remaining: DEFAULT_TIMER_SECONDS,
  running: false,
};
let endsAt: number | null = null;
let interval: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();

export function getTimerState(): TimerState {
  return state;
}

export function subscribeToTimer(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  listeners.forEach((l) => l());
}

function persist(): void {
  const payload: PersistedTimer = { ...state, endsAt };
  AsyncStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(payload)).catch(() => {
    /* a lost write only costs the timer across a process restart */
  });
}

function setState(next: TimerState, options: { persist?: boolean } = {}): void {
  state = next;
  if (options.persist !== false) persist();
  emit();
}

function stopTicking(): void {
  if (interval !== null) {
    clearInterval(interval);
    interval = null;
  }
}

/** Whole seconds left until `endsAt`, rounded up so 0 only means "elapsed". */
function remainingFrom(target: number, now: number): number {
  return Math.max(0, Math.ceil((target - now) / 1000));
}

function tick(): void {
  if (endsAt === null) return;
  const left = remainingFrom(endsAt, Date.now());
  if (left <= 0) {
    stopTicking();
    endsAt = null;
    setState({ ...state, remaining: 0, running: false });
    hapticNotification(Haptics.NotificationFeedbackType.Success).catch(() => {});
    return;
  }
  if (left !== state.remaining) setState({ ...state, remaining: left });
}

function startTicking(): void {
  stopTicking();
  interval = setInterval(tick, 1000);
}

/** A usable countdown length, or null when the input is not one. */
function normaliseSeconds(seconds: number): number | null {
  if (!Number.isFinite(seconds)) return null;
  const whole = Math.floor(seconds);
  if (whole <= 0 || whole > MAX_TIMER_SECONDS) return null;
  return whole;
}

/**
 * Set the countdown length without starting it. Invalid values (0, negative,
 * NaN, above `MAX_TIMER_SECONDS`) are ignored so a bad caller cannot leave the
 * timer in a state the UI cannot express.
 */
export function setTimerDuration(seconds: number): void {
  const value = normaliseSeconds(seconds);
  if (value === null) return;
  stopTicking();
  endsAt = null;
  setState({ duration: value, remaining: value, running: false });
}

/**
 * Start (or restart) the countdown. `seconds` overrides the configured
 * duration; omitting it re-runs the current one. Calling it while already
 * running restarts from the full duration rather than stacking intervals.
 */
export function startTimer(seconds?: number): void {
  const value = seconds === undefined ? state.duration : normaliseSeconds(seconds);
  if (value === null) return;
  endsAt = Date.now() + value * 1000;
  setState({ duration: value, remaining: value, running: true });
  startTicking();
}

/** Resume a paused countdown from the seconds it has left. No-op when idle. */
export function resumeTimer(): void {
  if (state.running || state.remaining <= 0) return;
  endsAt = Date.now() + state.remaining * 1000;
  setState({ ...state, running: true });
  startTicking();
}

/** Pause without losing the remaining seconds. Idempotent. */
export function pauseTimer(): void {
  if (!state.running) return;
  stopTicking();
  const left = endsAt === null ? state.remaining : remainingFrom(endsAt, Date.now());
  endsAt = null;
  setState({ ...state, remaining: left, running: false });
}

/** Stop and rearm at the full duration — the Cancel button. Idempotent. */
export function stopTimer(): void {
  stopTicking();
  endsAt = null;
  setState({ ...state, remaining: state.duration, running: false });
}

/**
 * Restore persisted state. Safe to call repeatedly; a timer already running in
 * this session wins over whatever is on disk.
 */
export async function hydrateTimer(): Promise<void> {
  if (state.running) return;
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(TIMER_STORAGE_KEY);
  } catch {
    return;
  }
  if (raw === null) return;

  let parsed: Partial<PersistedTimer>;
  try {
    parsed = JSON.parse(raw) as Partial<PersistedTimer>;
  } catch {
    return; // corrupt payload: keep defaults rather than crash the Clock screen
  }
  if (parsed === null || typeof parsed !== 'object') return;

  const duration = normaliseSeconds(Number(parsed.duration)) ?? DEFAULT_TIMER_SECONDS;
  const storedEndsAt = typeof parsed.endsAt === 'number' && Number.isFinite(parsed.endsAt) ? parsed.endsAt : null;

  if (parsed.running === true && storedEndsAt !== null) {
    const left = remainingFrom(storedEndsAt, Date.now());
    if (left > 0) {
      endsAt = storedEndsAt;
      setState({ duration, remaining: left, running: true }, { persist: false });
      startTicking();
      return;
    }
    endsAt = null;
    setState({ duration, remaining: 0, running: false }, { persist: false });
    return;
  }

  const storedRemaining = Number(parsed.remaining);
  const remaining =
    Number.isFinite(storedRemaining) && storedRemaining >= 0 && storedRemaining <= duration
      ? Math.floor(storedRemaining)
      : duration;
  endsAt = null;
  setState({ duration, remaining, running: false }, { persist: false });
}

/** Test-only: drop all state, listeners and any live interval. */
export function resetTimerStoreForTests(): void {
  stopTicking();
  endsAt = null;
  listeners.clear();
  state = { duration: DEFAULT_TIMER_SECONDS, remaining: DEFAULT_TIMER_SECONDS, running: false };
}
