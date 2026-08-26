import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addSentMessage,
  DEDUPE_WINDOW_MS,
  loadSentMessages,
  MAX_PER_THREAD,
  mergeSentWithProvider,
  normalizeAddress,
  pruneByThread,
  sentMessageToDeviceSms,
  type SentMessage,
} from '../SentMessagesStore';
import type { DeviceSms } from '../DeviceStore';

// Stateful in-memory AsyncStorage mock — setItem persists so a subsequent
// getItem returns what was written (matches ConversationScreen.test.tsx's
// setupMemoryAsyncStorage helper).
function setupMemoryAsyncStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
    store.has(key) ? store.get(key) : null,
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
  return store;
}

beforeEach(() => {
  jest.clearAllMocks();
  setupMemoryAsyncStorage();
});

function sms(overrides: Partial<DeviceSms> & { address: string; body: string }): DeviceSms {
  return {
    id: 'p1',
    dateFormatted: 'Today',
    type: 1,
    isRead: true,
    date: 0,
    ...overrides,
  };
}

describe('normalizeAddress', () => {
  it('matches numbers that differ only by formatting', () => {
    expect(normalizeAddress('+1 (555) 123-4567')).toBe(normalizeAddress('5551234567'));
  });

  it('keeps short codes/emergency numbers distinct (no 10-digit truncation)', () => {
    expect(normalizeAddress('911')).toBe('911');
    expect(normalizeAddress('123')).not.toBe(normalizeAddress('456'));
  });

  it('returns an empty string for an address with no digits', () => {
    expect(normalizeAddress('unknown')).toBe('');
  });
});

describe('addSentMessage', () => {
  it('persists the message so it survives a fresh load (app restart)', async () => {
    const saved = await addSentMessage('+15551234567', 'hello', 1_000);
    const reloaded = await loadSentMessages();
    expect(reloaded).toEqual([saved]);
  });

  it('prefixes the id so it can never collide with a provider _ID (a bare numeric string)', async () => {
    const saved = await addSentMessage('+15551234567', 'hello', 1_000);
    expect(saved.id.startsWith('local:')).toBe(true);
    expect(saved.id).not.toMatch(/^\d+$/);
  });

  it('two sends in the same millisecond get distinct ids', async () => {
    const a = await addSentMessage('+15551234567', 'first', 1_000);
    const b = await addSentMessage('+15551234567', 'second', 1_000);
    expect(a.id).not.toBe(b.id);
  });

  it('defaults status to sent', async () => {
    const saved = await addSentMessage('+15551234567', 'hello', 1_000);
    expect(saved.status).toBe('sent');
  });
});

describe('pruneByThread', () => {
  function makeThread(address: string, count: number): SentMessage[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `local:${i}`,
      address,
      body: `msg ${i}`,
      date: i, // ascending: higher i = newer
      status: 'sent' as const,
    }));
  }

  it('keeps all messages when under the limit', () => {
    const thread = makeThread('+15551234567', 5);
    expect(pruneByThread(thread, 500)).toHaveLength(5);
  });

  it('drops the oldest messages above the limit, keeping the newest', () => {
    const thread = makeThread('+15551234567', 10);
    const pruned = pruneByThread(thread, 3);

    expect(pruned).toHaveLength(3);
    // Newest 3 (date 9, 8, 7) survive; oldest (date 0..6) are gone.
    const dates = pruned.map((m) => m.date).sort((a, b) => a - b);
    expect(dates).toEqual([7, 8, 9]);
  });

  it('prunes each thread independently (one full thread does not evict another)', () => {
    const threadA = makeThread('+15551234567', 10);
    const threadB = makeThread('+15559876543', 2);
    const pruned = pruneByThread([...threadA, ...threadB], 3);

    expect(pruned.filter((m) => m.address === '+15551234567')).toHaveLength(3);
    expect(pruned.filter((m) => m.address === '+15559876543')).toHaveLength(2);
  });

  it('uses the default 500-per-thread cap when none is given', () => {
    const thread = makeThread('+15551234567', 501);
    expect(pruneByThread(thread)).toHaveLength(MAX_PER_THREAD);
  });

  it('empty input stays empty', () => {
    expect(pruneByThread([])).toEqual([]);
  });
});

describe('mergeSentWithProvider', () => {
  const ADDRESS = '+15551234567';

  it('appends a local-only message ahead of provider messages, newest first', () => {
    const local: SentMessage = { id: 'local:1', address: ADDRESS, body: 'hi', date: 2_000, status: 'sent' };
    const provider = [sms({ id: '1', address: ADDRESS, body: 'older', date: 1_000 })];

    const merged = mergeSentWithProvider([local], provider);

    expect(merged.map((m) => m.id)).toEqual(['local:1', '1']);
  });

  it('drops the local message once the provider has the same address+body within the dedupe window', () => {
    const local: SentMessage = { id: 'local:1', address: ADDRESS, body: 'hi', date: 10_000, status: 'sent' };
    const provider = [sms({ id: '1', address: ADDRESS, body: 'hi', date: 10_000 + DEDUPE_WINDOW_MS })];

    const merged = mergeSentWithProvider([local], provider);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('1');
  });

  it('keeps the local message when the provider match is just outside the dedupe window', () => {
    const local: SentMessage = { id: 'local:1', address: ADDRESS, body: 'hi', date: 10_000, status: 'sent' };
    const provider = [sms({ id: '1', address: ADDRESS, body: 'hi', date: 10_000 + DEDUPE_WINDOW_MS + 1 })];

    const merged = mergeSentWithProvider([local], provider);

    // Provider row is newer (outside the window), so it sorts first.
    expect(merged.map((m) => m.id)).toEqual(['1', 'local:1']);
  });

  it('keeps the local message when the provider has the same body but a different address', () => {
    const local: SentMessage = { id: 'local:1', address: ADDRESS, body: 'hi', date: 10_000, status: 'sent' };
    const provider = [sms({ id: '1', address: '+15559999999', body: 'hi', date: 10_000 })];

    const merged = mergeSentWithProvider([local], provider);

    expect(merged.map((m) => m.id)).toEqual(['local:1', '1']);
  });

  it('keeps the local message when the provider has the same address but a different body', () => {
    const local: SentMessage = { id: 'local:1', address: ADDRESS, body: 'hi', date: 10_000, status: 'sent' };
    const provider = [sms({ id: '1', address: ADDRESS, body: 'bye', date: 10_000 })];

    const merged = mergeSentWithProvider([local], provider);

    expect(merged.map((m) => m.id)).toEqual(['local:1', '1']);
  });

  it('matches addresses that only differ by formatting when deduping', () => {
    const local: SentMessage = { id: 'local:1', address: '+1 (555) 123-4567', body: 'hi', date: 10_000, status: 'sent' };
    const provider = [sms({ id: '1', address: '5551234567', body: 'hi', date: 10_000 })];

    const merged = mergeSentWithProvider([local], provider);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('1');
  });

  it('empty provider and empty local both produce an empty list', () => {
    expect(mergeSentWithProvider([], [])).toEqual([]);
  });
});

describe('sentMessageToDeviceSms', () => {
  it('marks the message as sent (type 2) and read', () => {
    const asSms = sentMessageToDeviceSms({ id: 'local:1', address: '+1', body: 'hi', date: 1_000, status: 'sent' });
    expect(asSms.type).toBe(2);
    expect(asSms.isRead).toBe(true);
  });
});
