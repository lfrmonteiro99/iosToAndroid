import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  captureBatched,
  releaseBatched,
  hydrateBatchedSummaryBuffer,
  __resetScheduledSummaryBufferForTests,
  BATCHED_SUMMARY_STORAGE_KEY,
} from '../scheduledSummaryBuffer';

// Own the AsyncStorage mock so getItem/setItem behave like a real backing
// store (the global jest.setup.js stub only returns null and resolves sets),
// mirroring the pattern used by AutoBackupSchedule.test.ts.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

// Backing store simulating the real AsyncStorage persisting across a
// simulated process restart (__resetScheduledSummaryBufferForTests clears
// only the module's in-memory state, mirroring what a real restart wipes).
let backingStore: Map<string, string>;

function wireAsyncStorage() {
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(backingStore.has(key) ? backingStore.get(key)! : null),
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation((key: string, value: string) => {
    backingStore.set(key, value);
    return Promise.resolve();
  });
}

function notif(id: string, extra: Partial<{ title: string; text: string; packageName: string }> = {}) {
  return { id, title: `title-${id}`, text: `text-${id}`, packageName: 'com.news.app', ...extra };
}

// Flushes microtasks queued by the module's fire-and-forget `void persist()`
// calls so assertions on the AsyncStorage mock see the latest write.
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('scheduledSummaryBuffer — issue #868', () => {
  beforeEach(() => {
    __resetScheduledSummaryBufferForTests();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T08:00:00.000Z'));
    backingStore = new Map();
    wireAsyncStorage();
    (AsyncStorage.getItem as jest.Mock).mockClear();
    (AsyncStorage.setItem as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('captures a notification and release() returns it, then empties the buffer', async () => {
    captureBatched(notif('n1'));
    await flush();

    const released = releaseBatched('morning');
    expect(released).toEqual([
      expect.objectContaining({ id: 'n1', title: 'title-n1', text: 'text-n1', packageName: 'com.news.app' }),
    ]);

    // Buffer is empty after release — a second call must return nothing.
    expect(releaseBatched('morning')).toEqual([]);
  });

  it('preserves capture order across multiple entries', async () => {
    captureBatched(notif('n1'));
    captureBatched(notif('n2'));
    captureBatched(notif('n3'));
    await flush();

    const released = releaseBatched('evening');
    expect(released.map((n) => n.id)).toEqual(['n1', 'n2', 'n3']);
  });

  it('releasing an empty buffer returns an empty array without touching AsyncStorage errors', () => {
    expect(releaseBatched('morning')).toEqual([]);
  });

  it('persists captured entries to AsyncStorage under the batched_summary_v1 key', async () => {
    captureBatched(notif('n1'));
    await flush();

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      BATCHED_SUMMARY_STORAGE_KEY,
      expect.stringContaining('"n1"'),
    );
  });

  it('caps the buffer at ~200 entries, dropping the oldest first', async () => {
    for (let i = 0; i < 205; i++) {
      captureBatched(notif(`n${i}`));
    }
    await flush();

    const released = releaseBatched('morning');
    expect(released.length).toBe(200);
    expect(released[0].id).toBe('n5'); // the first 5 (n0..n4) were dropped
    expect(released[released.length - 1].id).toBe('n204');
  });

  it('survives a simulated restart: entries captured before the "kill" are still released after reload', async () => {
    // Session 1: capture, which persists to the shared backing store.
    captureBatched(notif('n1'));
    captureBatched(notif('n2'));
    await flush();

    // Simulate a process restart: module's in-memory state is gone, but the
    // AsyncStorage backing store (the real disk in production) survives.
    __resetScheduledSummaryBufferForTests();

    // Nothing hydrated yet — releasing now must not silently discard the
    // not-yet-loaded on-disk backlog.
    expect(releaseBatched('morning')).toEqual([]);

    // ...until the buffer is hydrated from AsyncStorage (e.g. at app startup).
    await hydrateBatchedSummaryBuffer();
    const released = releaseBatched('morning');
    expect(released.map((n) => n.id)).toEqual(['n1', 'n2']);
  });

  it('ignores a notification with no id', async () => {
    captureBatched({ title: 'no id', text: 'x' } as unknown as { id: string });
    await flush();

    expect(releaseBatched('morning')).toEqual([]);
  });
});
