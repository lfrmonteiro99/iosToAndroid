import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  isBackupDue,
  loadAutoBackupPrefs,
  saveAutoBackupPrefs,
  withBackupTimestamp,
  DEFAULT_AUTO_BACKUP_PREFS,
  type AutoBackupPrefs,
} from '../AutoBackupSchedule';

// Own the AsyncStorage mock so getItem/setItem behave like a real backing store
// (the global jest.setup.js stub only returns null and resolves sets).
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function at(iso: string): Date {
  return new Date(iso);
}

function prefs(overrides: Partial<AutoBackupPrefs> = {}): AutoBackupPrefs {
  return { ...DEFAULT_AUTO_BACKUP_PREFS, ...overrides };
}

// In-memory backing store keyed by the AsyncStorage key used by the module.
const STORAGE_KEY = '@iostoandroid/auto_backup_prefs';
function setupAsyncStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(store.has(key) ? store.get(key)! : null),
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation((key: string, value: string) => {
    store.set(key, value);
    return Promise.resolve();
  });
  return store;
}

beforeEach(() => {
  (AsyncStorage.getItem as jest.Mock).mockClear();
  (AsyncStorage.setItem as jest.Mock).mockClear();
  setupAsyncStorage();
});

describe('isBackupDue', () => {
  it('is true for a never-backed-up schedule (lastBackupAt === null)', () => {
    expect(isBackupDue(prefs({ enabled: true, frequency: 'daily', lastBackupAt: null }), at('2026-01-10T12:00:00.000Z'))).toBe(true);
    expect(isBackupDue(prefs({ enabled: true, frequency: 'weekly', lastBackupAt: null }), at('2026-01-10T12:00:00.000Z'))).toBe(true);
  });

  it('is false well within the daily interval', () => {
    const last = at('2026-01-10T12:00:00.000Z');
    const now = new Date(last.getTime() + 12 * HOUR); // half a day later
    expect(isBackupDue(prefs({ enabled: true, frequency: 'daily', lastBackupAt: last.toISOString() }), now)).toBe(false);
  });

  it('is false well within the weekly interval', () => {
    const last = at('2026-01-01T12:00:00.000Z');
    const now = new Date(last.getTime() + 3 * DAY); // three days later
    expect(isBackupDue(prefs({ enabled: true, frequency: 'weekly', lastBackupAt: last.toISOString() }), now)).toBe(false);
  });

  it('is true exactly at the daily boundary (now - last === interval)', () => {
    const last = at('2026-01-10T12:00:00.000Z');
    const now = new Date(last.getTime() + DAY); // exactly 24h later
    expect(isBackupDue(prefs({ enabled: true, frequency: 'daily', lastBackupAt: last.toISOString() }), now)).toBe(true);
  });

  it('is true exactly at the weekly boundary (now - last === interval)', () => {
    const last = at('2026-01-01T12:00:00.000Z');
    const now = new Date(last.getTime() + 7 * DAY); // exactly 7 days later
    expect(isBackupDue(prefs({ enabled: true, frequency: 'weekly', lastBackupAt: last.toISOString() }), now)).toBe(true);
  });

  it('is true just past the daily boundary', () => {
    const last = at('2026-01-10T12:00:00.000Z');
    const now = new Date(last.getTime() + DAY + 1); // 1ms past
    expect(isBackupDue(prefs({ enabled: true, frequency: 'daily', lastBackupAt: last.toISOString() }), now)).toBe(true);
  });

  it('is false just before the daily boundary (1ms short)', () => {
    const last = at('2026-01-10T12:00:00.000Z');
    const now = new Date(last.getTime() + DAY - 1); // 1ms short of 24h
    expect(isBackupDue(prefs({ enabled: true, frequency: 'daily', lastBackupAt: last.toISOString() }), now)).toBe(false);
  });

  it('is false when auto-backup is disabled, even if the interval has long passed', () => {
    const last = at('2026-01-01T12:00:00.000Z');
    const now = new Date(last.getTime() + 30 * DAY);
    expect(isBackupDue(prefs({ enabled: false, frequency: 'daily', lastBackupAt: last.toISOString() }), now)).toBe(false);
  });

  it('treats a corrupt/invalid timestamp as due (never-backed-up equivalent)', () => {
    const now = at('2026-01-10T12:00:00.000Z');
    expect(isBackupDue(prefs({ enabled: true, frequency: 'daily', lastBackupAt: 'not-a-date' }), now)).toBe(true);
  });
});

describe('withBackupTimestamp', () => {
  it('returns prefs with lastBackupAt set to the provided instant', () => {
    const now = at('2026-02-02T08:30:00.000Z');
    const result = withBackupTimestamp(prefs({ lastBackupAt: null }), now);
    expect(result.lastBackupAt).toBe('2026-02-02T08:30:00.000Z');
    // Does not mutate the input.
    expect(prefs({ lastBackupAt: null }).lastBackupAt).toBeNull();
  });
});

describe('loadAutoBackupPrefs / saveAutoBackupPrefs', () => {
  it('returns defaults when nothing is stored', async () => {
    const result = await loadAutoBackupPrefs();
    expect(result).toEqual(DEFAULT_AUTO_BACKUP_PREFS);
  });

  it('round-trips a saved schedule through AsyncStorage', async () => {
    const saved: AutoBackupPrefs = { enabled: true, frequency: 'weekly', lastBackupAt: '2026-03-03T03:03:00.000Z' };
    await saveAutoBackupPrefs(saved);

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(saved));
    const loaded = await loadAutoBackupPrefs();
    expect(loaded).toEqual(saved);
  });

  it('reads back prefs after re-render (fresh load call, same storage)', async () => {
    await saveAutoBackupPrefs({ enabled: true, frequency: 'daily', lastBackupAt: null });
    // Simulate a re-render loading the prefs again.
    const first = await loadAutoBackupPrefs();
    const second = await loadAutoBackupPrefs();
    expect(first).toEqual(second);
    expect(first).toEqual({ enabled: true, frequency: 'daily', lastBackupAt: null });
  });

  it('normalizes an unknown frequency to the daily default on load', async () => {
    setupAsyncStorage({ [STORAGE_KEY]: JSON.stringify({ enabled: true, frequency: 'fortnightly', lastBackupAt: null }) });
    const loaded = await loadAutoBackupPrefs();
    expect(loaded.frequency).toBe('daily');
    expect(loaded.enabled).toBe(true);
  });

  it('coerces a non-boolean enabled flag on load', async () => {
    setupAsyncStorage({ [STORAGE_KEY]: JSON.stringify({ enabled: 'yes', frequency: 'weekly', lastBackupAt: 'x' }) });
    const loaded = await loadAutoBackupPrefs();
    expect(loaded.enabled).toBe(true);
  });

  it('falls back to defaults when the stored JSON is corrupt', async () => {
    setupAsyncStorage({ [STORAGE_KEY]: 'this is not json' });
    const loaded = await loadAutoBackupPrefs();
    expect(loaded).toEqual(DEFAULT_AUTO_BACKUP_PREFS);
  });

  it('falls back to defaults when getItem throws', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation(() => Promise.reject(new Error('disk error')));
    const loaded = await loadAutoBackupPrefs();
    expect(loaded).toEqual(DEFAULT_AUTO_BACKUP_PREFS);
  });

  it('does not leak a passphrase field into the persisted shape', async () => {
    const saved: AutoBackupPrefs = { enabled: true, frequency: 'daily', lastBackupAt: null };
    await saveAutoBackupPrefs(saved);
    const written = JSON.parse((AsyncStorage.setItem as jest.Mock).mock.calls[0][1]);
    expect(written).not.toHaveProperty('passphrase');
    expect(Object.keys(written).sort()).toEqual(['enabled', 'frequency', 'lastBackupAt']);
  });
});
