import React from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { render, fireEvent, waitFor, act } from '../../../test-utils';
import { BackupRestoreScreen } from '../BackupRestoreScreen';
import { AUTO_BACKUP_STORAGE_KEY } from '../../../services/AutoBackupSchedule';

const mockSetStringAsync = jest.fn<Promise<void>, [string]>();
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn((s: string) => mockSetStringAsync(s)),
  getStringAsync: jest.fn().mockResolvedValue(''),
}));

// ALL_DATA contains both settings and non-settings keys.
// getMany is called with an explicit EXPORTABLE_KEYS list — only those keys are fetched.
const ALL_DATA: Record<string, string> = {
  '@iostoandroid/settings': '{"vibration":true}',
  '@iostoandroid/theme_preference': 'dark',
  '@iostoandroid/sms_messages': '[{"id":"1","body":"secret"}]',  // non-settings
  '@iostoandroid/notes': 'My private note',                       // non-settings
};

const mockGetMany = jest.fn<Promise<Record<string, string | null>>, [string[]]>();
const mockSetMany = jest.fn<Promise<void>, [Record<string, string>]>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    getAllKeys: jest.fn(() => Promise.resolve(Object.keys(ALL_DATA))),
    getMany: jest.fn((keys: string[]) => mockGetMany(keys)),
    setMany: (entries: Record<string, string>) => mockSetMany(entries),
    clear: jest.fn(() => Promise.resolve()),
  },
}));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

// --- AppState harness -------------------------------------------------------
// The production code registers its foreground reminder through
// AppState.addEventListener; capturing the real handler lets the tests drive a
// genuine background -> foreground transition (same pattern as ClockScreen).
let changeHandlers: ((state: AppStateStatus) => void)[] = [];

function fireAppState(state: AppStateStatus) {
  [...changeHandlers].forEach((handler) => handler(state));
}

beforeEach(() => {
  changeHandlers = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
    if (type === 'change') changeHandlers.push(handler as (state: AppStateStatus) => void);
    return {
      remove: () => {
        changeHandlers = changeHandlers.filter((h) => h !== handler);
      },
    };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('BackupRestoreScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMany.mockImplementation((keys: string[]) => {
      const result: Record<string, string | null> = {};
      for (const k of keys) {
        result[k] = ALL_DATA[k] ?? null;
      }
      return Promise.resolve(result);
    });
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<BackupRestoreScreen navigation={mockNavigation as never} />);
    expect(toJSON()).toBeTruthy();
  });

  // Red step: before fix, pressing Export immediately calls getAllKeys() and writes ALL
  // data (including SMS/notes) to clipboard with no disclosure.
  // After fix: disclosure dialog appears first; on confirm, only EXPORTABLE_KEYS are exported.
  it('exports only settings keys — no SMS or notes in clipboard', async () => {
    const { getByText } = render(<BackupRestoreScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByText('Export Settings'));

    // Disclosure dialog should appear before clipboard is written
    await waitFor(() => expect(getByText('Export')).toBeTruthy());
    fireEvent.press(getByText('Export'));

    await waitFor(() => expect(mockSetStringAsync).toHaveBeenCalled());

    const rawArg = (mockSetStringAsync.mock.calls[0] as [string])[0];
    const exported = JSON.parse(rawArg) as Record<string, unknown>;

    expect(exported['@iostoandroid/settings']).toBe('{"vibration":true}');
    expect(exported['@iostoandroid/theme_preference']).toBe('dark');
    expect(exported['@iostoandroid/sms_messages']).toBeUndefined();
    expect(exported['@iostoandroid/notes']).toBeUndefined();
  });

  it('does not call getAllKeys during export', async () => {
    const AsyncStorageMock = jest.requireMock('@react-native-async-storage/async-storage').default;
    const { getByText } = render(<BackupRestoreScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByText('Export Settings'));
    await waitFor(() => expect(getByText('Export')).toBeTruthy());
    fireEvent.press(getByText('Export'));
    await waitFor(() => expect(mockSetStringAsync).toHaveBeenCalled());

    expect(AsyncStorageMock.getAllKeys).not.toHaveBeenCalled();
  });

  // Red step for import: before fix, ALL keys from the JSON blob are written to storage,
  // including non-settings keys. After fix, only keys in EXPORTABLE_KEYS are written.
  it('import ignores keys outside the allow-list', async () => {
    const { getByText, getByPlaceholderText } = render(
      <BackupRestoreScreen navigation={mockNavigation as never} />,
    );

    fireEvent.press(getByText('Import Settings'));
    const textarea = getByPlaceholderText('{"@iostoandroid/...": "..."}');

    const maliciousBackup = JSON.stringify({
      '@iostoandroid/settings': '{"vibration":false}',
      '@iostoandroid/sms_messages': 'injected',
      '@iostoandroid/notes': 'injected',
    });

    fireEvent.changeText(textarea, maliciousBackup);
    fireEvent.press(getByText('Import'));

    await waitFor(() => expect(mockSetMany).toHaveBeenCalled());

    const writtenEntries = mockSetMany.mock.calls[0][0];
    expect(writtenEntries['@iostoandroid/settings']).toBe('{"vibration":false}');
    expect(writtenEntries['@iostoandroid/sms_messages']).toBeUndefined();
    expect(writtenEntries['@iostoandroid/notes']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Auto Backup (issue #283)
//
// Implements Auto Backup as a FOREGROUND-TRIGGERED reminder only (per #270 the
// passphrase must never be persisted and there is no silent upload path in this
// tree). The manual "Export Settings" flow is the only backup action, so the
// prompt reuses it. These tests assert: toggle + frequency persist, the prompt
// only appears on a genuine due+foreground transition, and the manual export /
// import flows are untouched when Auto Backup is off (regression guards).
//
// A real in-memory AsyncStorage store backs BOTH getItem and setItem so that
// the mount-time loadAutoBackupPrefs() reflects what was previously persisted,
// and a user toggle survives the async load settling.
// ---------------------------------------------------------------------------
describe('BackupRestoreScreen — Auto Backup', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new Map<string, string>();
    mockGetMany.mockImplementation((keys: string[]) => {
      const result: Record<string, string | null> = {};
      for (const k of keys) result[k] = ALL_DATA[k] ?? null;
      return Promise.resolve(result);
    });
    const AsyncStorageMock = jest.requireMock('@react-native-async-storage/async-storage').default;
    (AsyncStorageMock.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(store.has(key) ? store.get(key)! : null),
    );
    (AsyncStorageMock.setItem as jest.Mock).mockImplementation((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    });
  });

  function loadPrefs() {
    const AsyncStorageMock = jest.requireMock('@react-native-async-storage/async-storage').default;
    const calls = (AsyncStorageMock.setItem as jest.Mock).mock.calls.filter(
      (c: [string, string]) => c[0] === AUTO_BACKUP_STORAGE_KEY,
    );
    return calls.length ? JSON.parse(calls[calls.length - 1][1]) : null;
  }

  it('shows an Auto Backup toggle defaulting to off', () => {
    const { getByTestId } = render(<BackupRestoreScreen navigation={mockNavigation as never} />);
    const sw = getByTestId('auto-backup-switch');
    expect(sw.props.accessibilityRole).toBe('switch');
    expect(sw.props.accessibilityState.checked).toBe(false);
  });

  it('toggling Auto Backup on persists enabled via AsyncStorage', async () => {
    const { getByTestId } = render(<BackupRestoreScreen navigation={mockNavigation as never} />);
    fireEvent.press(getByTestId('auto-backup-switch'));
    await waitFor(() => expect(loadPrefs()?.enabled).toBe(true));
  });

  it('switching daily/weekly persists frequency via AsyncStorage', async () => {
    const { getByTestId, getByText } = render(<BackupRestoreScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByTestId('auto-backup-switch'));
    await waitFor(() => expect(loadPrefs()?.enabled).toBe(true));

    // Frequency row appears once enabled; the segmented control renders text
    // segments "Daily"/"Weekly". Press Weekly to switch frequency.
    fireEvent.press(getByText('Weekly'));
    await waitFor(() => expect(loadPrefs()?.frequency).toBe('weekly'));
  });

  it('reads back persisted prefs after a re-render (same storage)', async () => {
    const { getByTestId, rerender } = render(<BackupRestoreScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByTestId('auto-backup-switch'));
    await waitFor(() => expect(loadPrefs()?.enabled).toBe(true));

    // Re-render with the same in-memory storage backend.
    rerender(<BackupRestoreScreen navigation={mockNavigation as never} />);
    // After the async reload settles, the toggle must still be ON.
    await waitFor(() =>
      expect(getByTestId('auto-backup-switch').props.accessibilityState.checked).toBe(true),
    );
  });

  it('surfaces the "Time for your backup" prompt on a due foreground transition', async () => {
    // Pre-seed: Auto Backup enabled, daily, lastBackupAt far in the past.
    store.set(
      AUTO_BACKUP_STORAGE_KEY,
      JSON.stringify({ enabled: true, frequency: 'daily', lastBackupAt: '2000-01-01T00:00:00.000Z' }),
    );

    const { getByText } = render(<BackupRestoreScreen navigation={mockNavigation as never} />);

    await act(async () => {
      fireAppState('active');
    });

    await waitFor(() => expect(getByText('Time for your backup')).toBeTruthy());
  });

  // Regression for the reviewer-blocked round: the screen only ever mounts
  // while the app is already in the foreground (there is no route to it while
  // backgrounded) — a normal in-app navigation to Settings never fires a
  // synthetic AppState 'change' event first. Gating the mount-time due-check
  // on a "last seen AppState" ref (which starts unset) silently swallowed
  // this exact case: the reminder never appeared until some later, unrelated
  // foreground transition happened to fire.
  it('surfaces the prompt on mount when overdue, with NO AppState event fired at all', async () => {
    store.set(
      AUTO_BACKUP_STORAGE_KEY,
      JSON.stringify({ enabled: true, frequency: 'daily', lastBackupAt: '2000-01-01T00:00:00.000Z' }),
    );

    const { getByText } = render(<BackupRestoreScreen navigation={mockNavigation as never} />);

    // No fireAppState(...) call anywhere in this test — mounting alone must
    // be enough to surface the reminder.
    await waitFor(() => expect(getByText('Time for your backup')).toBeTruthy());
  });

  it('does NOT surface the prompt when Auto Backup is off', async () => {
    const { queryByText } = render(<BackupRestoreScreen navigation={mockNavigation as never} />);

    await act(async () => {
      fireAppState('active');
    });

    expect(queryByText('Time for your backup')).toBeNull();
  });

  it('does NOT prompt on a non-active transition (e.g. background) when not due', async () => {
    // lastBackupAt is "now" (well within the daily interval) so the mount-time
    // due-check itself finds nothing due; this isolates the assertion that
    // follows to the 'background' branch of the AppState listener specifically.
    store.set(
      AUTO_BACKUP_STORAGE_KEY,
      JSON.stringify({ enabled: true, frequency: 'daily', lastBackupAt: new Date().toISOString() }),
    );

    const { queryByText } = render(<BackupRestoreScreen navigation={mockNavigation as never} />);
    await waitFor(() => expect(queryByText('Time for your backup')).toBeNull());

    await act(async () => {
      fireAppState('background');
    });

    expect(queryByText('Time for your backup')).toBeNull();
  });

  it('tapping "Back Up Now" in the prompt runs the manual export flow (never silent upload)', async () => {
    store.set(
      AUTO_BACKUP_STORAGE_KEY,
      JSON.stringify({ enabled: true, frequency: 'daily', lastBackupAt: '2000-01-01T00:00:00.000Z' }),
    );

    const { getByText } = render(<BackupRestoreScreen navigation={mockNavigation as never} />);

    await act(async () => {
      fireAppState('active');
    });
    await waitFor(() => expect(getByText('Time for your backup')).toBeTruthy());

    fireEvent.press(getByText('Back Up Now'));

    // The manual flow writes to the clipboard (the only backup action in this tree).
    await waitFor(() => expect(mockSetStringAsync).toHaveBeenCalled());
    // It stamps lastBackupAt into the auto-backup key (so the reminder stops).
    await waitFor(() => expect(loadPrefs()?.lastBackupAt).toEqual(expect.any(String)));
  });

  // --- Regression guards (issue #283 acceptance criteria) -----------------

  it('manual export with Auto Backup OFF does not write the auto-backup key', async () => {
    const { getByText } = render(<BackupRestoreScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByText('Export Settings'));
    await waitFor(() => expect(getByText('Export')).toBeTruthy());
    fireEvent.press(getByText('Export'));
    await waitFor(() => expect(mockSetStringAsync).toHaveBeenCalled());

    expect(loadPrefs()).toBeNull();
  });

  it('export (when off) still only writes allow-listed keys to clipboard', async () => {
    const { getByText } = render(<BackupRestoreScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByText('Export Settings'));
    await waitFor(() => expect(getByText('Export')).toBeTruthy());
    fireEvent.press(getByText('Export'));
    await waitFor(() => expect(mockSetStringAsync).toHaveBeenCalled());

    const exported = JSON.parse((mockSetStringAsync.mock.calls[0] as [string])[0]) as Record<string, unknown>;
    expect(exported['@iostoandroid/sms_messages']).toBeUndefined();
    expect(exported['@iostoandroid/notes']).toBeUndefined();
  });

  it('import flow is unaffected by Auto Backup (off by default)', async () => {
    const { getByText, getByPlaceholderText } = render(<BackupRestoreScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByText('Import Settings'));
    const textarea = getByPlaceholderText('{"@iostoandroid/...": "..."}');
    const maliciousBackup = JSON.stringify({
      '@iostoandroid/settings': '{"vibration":false}',
      '@iostoandroid/sms_messages': 'injected',
    });
    fireEvent.changeText(textarea, maliciousBackup);
    fireEvent.press(getByText('Import'));

    await waitFor(() => expect(mockSetMany).toHaveBeenCalled());
    const writtenEntries = mockSetMany.mock.calls[0][0];
    expect(writtenEntries['@iostoandroid/settings']).toBe('{"vibration":false}');
    expect(writtenEntries['@iostoandroid/sms_messages']).toBeUndefined();
  });
});

