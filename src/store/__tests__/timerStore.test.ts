import {
  DEFAULT_TIMER_SECONDS,
  MAX_TIMER_SECONDS,
  TIMER_STORAGE_KEY,
  getTimerState,
  hydrateTimer,
  pauseTimer,
  resetTimerStoreForTests,
  resumeTimer,
  setTimerDuration,
  startTimer,
  stopTimer,
  subscribeToTimer,
} from '../timerStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('timerStore', () => {
  // jest.setup.js stubs AsyncStorage with plain jest.fn()s; back them with an
  // in-memory map so persistence is actually observable here.
  let store: Record<string, string>;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    resetTimerStoreForTests();
    store = {};
    (AsyncStorage.getItem as jest.Mock).mockImplementation((k: string) =>
      Promise.resolve(Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    );
    (AsyncStorage.setItem as jest.Mock).mockImplementation((k: string, v: string) => {
      store[k] = v;
      return Promise.resolve();
    });
    (AsyncStorage.removeItem as jest.Mock).mockImplementation((k: string) => {
      delete store[k];
      return Promise.resolve();
    });
    await AsyncStorage.removeItem(TIMER_STORAGE_KEY);
  });

  afterEach(() => {
    resetTimerStoreForTests();
    jest.useRealTimers();
  });

  it('starts at the 5 minute default, idle', () => {
    expect(getTimerState()).toEqual({ duration: 300, remaining: 300, running: false });
    expect(DEFAULT_TIMER_SECONDS).toBe(300);
  });

  it('counts down one second per tick while running', () => {
    startTimer(60);
    expect(getTimerState().running).toBe(true);
    jest.advanceTimersByTime(1000);
    expect(getTimerState().remaining).toBe(59);
    jest.advanceTimersByTime(2000);
    expect(getTimerState().remaining).toBe(57);
  });

  it('stops at exactly 0 and never goes negative (boundary)', () => {
    startTimer(2);
    jest.advanceTimersByTime(2000);
    expect(getTimerState()).toEqual({ duration: 2, remaining: 0, running: false });
    jest.advanceTimersByTime(5000);
    expect(getTimerState().remaining).toBe(0);
  });

  it('accepts 1 second and rejects 0, negatives, NaN and above the 24h cap', () => {
    setTimerDuration(1);
    expect(getTimerState().duration).toBe(1);

    setTimerDuration(MAX_TIMER_SECONDS);
    expect(getTimerState().duration).toBe(MAX_TIMER_SECONDS);

    for (const bad of [0, -5, NaN, Infinity, MAX_TIMER_SECONDS + 1]) {
      setTimerDuration(bad);
      expect(getTimerState().duration).toBe(MAX_TIMER_SECONDS);
    }
  });

  it('ignores startTimer with an invalid duration instead of running to nowhere', () => {
    startTimer(-1);
    expect(getTimerState().running).toBe(false);
    startTimer(NaN);
    expect(getTimerState().running).toBe(false);
  });

  it('startTimer twice in a row does not stack intervals (double tap)', () => {
    startTimer(60);
    startTimer(60);
    jest.advanceTimersByTime(1000);
    expect(getTimerState().remaining).toBe(59);
  });

  it('pause is idempotent and keeps the remaining seconds', () => {
    startTimer(60);
    jest.advanceTimersByTime(3000);
    pauseTimer();
    pauseTimer();
    expect(getTimerState()).toEqual({ duration: 60, remaining: 57, running: false });
    jest.advanceTimersByTime(10000);
    expect(getTimerState().remaining).toBe(57);
  });

  it('resume continues from the paused value, and is a no-op when finished', () => {
    startTimer(60);
    jest.advanceTimersByTime(3000);
    pauseTimer();
    resumeTimer();
    expect(getTimerState().running).toBe(true);
    jest.advanceTimersByTime(1000);
    expect(getTimerState().remaining).toBe(56);

    startTimer(1);
    jest.advanceTimersByTime(1000);
    resumeTimer();
    expect(getTimerState().running).toBe(false);
  });

  it('stopTimer rearms at the full duration and is idempotent', () => {
    startTimer(60);
    jest.advanceTimersByTime(5000);
    stopTimer();
    stopTimer();
    expect(getTimerState()).toEqual({ duration: 60, remaining: 60, running: false });
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToTimer(listener);
    startTimer(60);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    const before = listener.mock.calls.length;
    jest.advanceTimersByTime(2000);
    expect(listener.mock.calls.length).toBe(before);
  });

  it('resumes a persisted running timer at the elapsed-adjusted remaining', async () => {
    await AsyncStorage.setItem(
      TIMER_STORAGE_KEY,
      JSON.stringify({ duration: 300, remaining: 300, running: true, endsAt: Date.now() + 120_000 }),
    );
    await hydrateTimer();
    expect(getTimerState()).toEqual({ duration: 300, remaining: 120, running: true });
  });

  it('treats a persisted running timer whose deadline already passed as finished', async () => {
    await AsyncStorage.setItem(
      TIMER_STORAGE_KEY,
      JSON.stringify({ duration: 300, remaining: 300, running: true, endsAt: Date.now() - 5_000 }),
    );
    await hydrateTimer();
    expect(getTimerState()).toEqual({ duration: 300, remaining: 0, running: false });
  });

  it('hydrate keeps defaults on an absent, corrupt or hostile payload', async () => {
    await hydrateTimer();
    expect(getTimerState()).toEqual({ duration: 300, remaining: 300, running: false });

    await AsyncStorage.setItem(TIMER_STORAGE_KEY, 'not json at all');
    await hydrateTimer();
    expect(getTimerState()).toEqual({ duration: 300, remaining: 300, running: false });

    await AsyncStorage.setItem(
      TIMER_STORAGE_KEY,
      JSON.stringify({ duration: -9, remaining: 'seven', running: 'yes', endsAt: 'soon' }),
    );
    await hydrateTimer();
    expect(getTimerState()).toEqual({ duration: 300, remaining: 300, running: false });
  });

  it('clamps a persisted remaining greater than the duration', async () => {
    await AsyncStorage.setItem(
      TIMER_STORAGE_KEY,
      JSON.stringify({ duration: 60, remaining: 5000, running: false, endsAt: null }),
    );
    await hydrateTimer();
    expect(getTimerState()).toEqual({ duration: 60, remaining: 60, running: false });
  });

  it('a timer running in this session wins over the persisted payload', async () => {
    startTimer(60);
    await AsyncStorage.setItem(
      TIMER_STORAGE_KEY,
      JSON.stringify({ duration: 900, remaining: 900, running: false, endsAt: null }),
    );
    await hydrateTimer();
    expect(getTimerState()).toEqual({ duration: 60, remaining: 60, running: true });
  });

  it('persists the running state so a later hydrate can restore it', async () => {
    startTimer(120);
    await Promise.resolve();
    const raw = await AsyncStorage.getItem(TIMER_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({
      duration: 120,
      remaining: 120,
      running: true,
      endsAt: Date.now() + 120_000,
    });
  });
});
