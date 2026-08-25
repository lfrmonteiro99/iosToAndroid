import React from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { render, fireEvent, waitFor, act, configure } from '../../../test-utils';
import { BackupRestoreScreen } from '../BackupRestoreScreen';
import { AUTO_BACKUP_STORAGE_KEY } from '../../../services/AutoBackupSchedule';
import { AlertProvider } from '../../../components/AlertProvider';

// The cloud-backup path runs a real key derivation (PBKDF2) before the upload,
// which takes well over RNTL's 1s default asyncUtilTimeout whenever this suite
// shares CPU with the rest of the settings suites — the three upload
// assertions passed in isolation and failed in a full run. Raised here rather
// than per call site so any future upload assertion inherits the same budget.
configure({ asyncUtilTimeout: 15000 });
jest.setTimeout(60000);

// BackupRestoreScreen uses useAlert() for its error/success dialogs. The shared
// test-utils wrapper does not mount AlertProvider, so useAlert() is a no-op there
// and the "Invalid backup data" alert would never reach the DOM. Wrap with
// AlertProvider so the alert dialog actually renders and can be asserted.
const renderScreen = (navigation: unknown = mockNavigation) =>
  render(
    <AlertProvider>
      <BackupRestoreScreen navigation={navigation as never} />
    </AlertProvider>,
  );

const mockSetStringAsync = jest.fn<Promise<void>, [string]>();
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn((s: string) => mockSetStringAsync(s)),
  getStringAsync: jest.fn().mockResolvedValue(''),
}));

// We mock the GoogleAuth service so the screen's conditional rendering and
// sign-in/sign-out dispatch are tested against the REAL screen component,
// not the native module. Two states are exercised: signed out (default) and
// signed in (override).
const mockSignIn = jest.fn();
const mockSignOut = jest.fn();
const mockGetInitialState = jest.fn();
const mockGetAccessToken = jest.fn();

jest.mock('../../../services/GoogleAuth', () => ({
  getInitialState: (...args: unknown[]) => mockGetInitialState(...args),
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
  getAccessToken: (...args: unknown[]) => mockGetAccessToken(...args),
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
    mockGetInitialState.mockReturnValue({ isSignedIn: false, email: null });
    mockSignIn.mockResolvedValue({ isSignedIn: true, email: 'user@gmail.com' });
    mockSignOut.mockResolvedValue(undefined);
    mockGetAccessToken.mockResolvedValue('fake-access-token');
    global.fetch = jest.fn();
  });

  it('renders without crashing', () => {
    const { toJSON } = renderScreen(mockNavigation);
    expect(toJSON()).toBeTruthy();
  });

  // Red step: before fix, pressing Export immediately calls getAllKeys() and writes ALL
  // data (including SMS/notes) to clipboard with no disclosure.
  // After fix: disclosure dialog appears first; on confirm, only EXPORTABLE_KEYS are exported.
  it('exports only settings keys — no SMS or notes in clipboard', async () => {
    const { getByText } = renderScreen(mockNavigation);

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

  it('opens the export disclosure dialog when Export Settings is tapped', () => {
    const { getByText } = renderScreen(mockNavigation);
    fireEvent.press(getByText('Export Settings'));
    expect(getByText(/copies your app preferences/i)).toBeTruthy();
  });

  it('does not call getAllKeys during export', async () => {
    const AsyncStorageMock = jest.requireMock('@react-native-async-storage/async-storage').default;
    const { getByText } = renderScreen(mockNavigation);

    fireEvent.press(getByText('Export Settings'));
    await waitFor(() => expect(getByText('Export')).toBeTruthy());
    fireEvent.press(getByText('Export'));
    await waitFor(() => expect(mockSetStringAsync).toHaveBeenCalled());

    expect(AsyncStorageMock.getAllKeys).not.toHaveBeenCalled();
  });

  // Red step for import: before fix, ALL keys from the JSON blob are written to storage,
  // including non-settings keys. After fix, only keys in EXPORTABLE_KEYS are written.
  it('import ignores keys outside the allow-list', async () => {
    const { getByText, getByPlaceholderText } = renderScreen(mockNavigation);

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

  // Regression guard (#269 clipboard path): a real, valid backup still writes
  // to AsyncStorage exactly as before, and does NOT show the invalid-data alert.
  it('valid string backup still calls setMany and shows no error alert', async () => {
    const { getByText, getByPlaceholderText, queryByText } = renderScreen(mockNavigation);

    fireEvent.press(getByText('Import Settings'));
    const textarea = getByPlaceholderText('{"@iostoandroid/...": "..."}');

    const validBackup = JSON.stringify({
      '@iostoandroid/settings': '{"vibration":true}',
      '@iostoandroid/theme_preference': 'dark',
    });

    fireEvent.changeText(textarea, validBackup);
    fireEvent.press(getByText('Import'));

    await waitFor(() => expect(mockSetMany).toHaveBeenCalled());
    const writtenEntries = mockSetMany.mock.calls[0][0];
    expect(writtenEntries['@iostoandroid/settings']).toBe('{"vibration":true}');
    expect(writtenEntries['@iostoandroid/theme_preference']).toBe('dark');
    expect(queryByText(/Invalid backup data/)).toBeNull();
  });

  // Red step for shape validation: a backup with a non-string value must NOT be
  // partially written. Before the fix the value was coerced via String() and
  // written; after the fix validateSnapshot throws and setMany is never called.
  it('non-string value backup shows the invalid alert and does NOT call setMany', async () => {
    const { getByText, getByPlaceholderText, queryByText } = renderScreen(mockNavigation);

    fireEvent.press(getByText('Import Settings'));
    const textarea = getByPlaceholderText('{"@iostoandroid/...": "..."}');

    const badBackup = JSON.stringify({ '@iostoandroid/settings': 123 });

    fireEvent.changeText(textarea, badBackup);
    fireEvent.press(getByText('Import'));

    await waitFor(() => expect(queryByText(/Invalid backup data/)).toBeTruthy());
    expect(mockSetMany).not.toHaveBeenCalled();
  });

  // Empty object must be rejected (no partial write).
  it('empty object shows the invalid alert and does NOT call setMany', async () => {
    const { getByText, getByPlaceholderText, queryByText } = renderScreen(mockNavigation);

    fireEvent.press(getByText('Import Settings'));
    const textarea = getByPlaceholderText('{"@iostoandroid/...": "..."}');

    fireEvent.changeText(textarea, JSON.stringify({}));
    fireEvent.press(getByText('Import'));

    await waitFor(() => expect(queryByText(/Invalid backup data/)).toBeTruthy());
    expect(mockSetMany).not.toHaveBeenCalled();
  });

  // Array must be rejected (no partial write).
  it('array backup shows the invalid alert and does NOT call setMany', async () => {
    const { getByText, getByPlaceholderText, queryByText } = renderScreen(mockNavigation);

    fireEvent.press(getByText('Import Settings'));
    const textarea = getByPlaceholderText('{"@iostoandroid/...": "..."}');

    fireEvent.changeText(textarea, JSON.stringify([1, 2, 3]));
    fireEvent.press(getByText('Import'));

    await waitFor(() => expect(queryByText(/Invalid backup data/)).toBeTruthy());
    expect(mockSetMany).not.toHaveBeenCalled();
  });
});

describe('BackupRestoreScreen — Google Drive section', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMany.mockImplementation((keys: string[]) => {
      const result: Record<string, string | null> = {};
      for (const k of keys) {
        result[k] = ALL_DATA[k] ?? null;
      }
      return Promise.resolve(result);
    });
    mockGetInitialState.mockReturnValue({ isSignedIn: false, email: null });
    mockSignIn.mockResolvedValue({ isSignedIn: true, email: 'user@gmail.com' });
    mockSignOut.mockResolvedValue(undefined);
    mockGetAccessToken.mockResolvedValue('fake-access-token');
    global.fetch = jest.fn();
  });

  it('shows the "Connect Google Drive" action when signed out', () => {
    const { getByText } = renderScreen();
    expect(getByText('Connect Google Drive')).toBeTruthy();
    expect(getByText('Back up to your private Drive app folder')).toBeTruthy();
  });

  it('shows the connected account email when signed in', () => {
    mockGetInitialState.mockReturnValue({ isSignedIn: true, email: 'user@gmail.com' });
    const { getByText } = renderScreen();
    expect(getByText('Connected: user@gmail.com')).toBeTruthy();
    expect(getByText('Tap to disconnect')).toBeTruthy();
  });

  it('calls signIn() when the Connect tile is tapped while signed out', () => {
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Connect Google Drive'));
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('calls signOut() when the connected tile is tapped while signed in', () => {
    mockGetInitialState.mockReturnValue({ isSignedIn: true, email: 'user@gmail.com' });
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Connected: user@gmail.com'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('seeds the signed-in state from getInitialState on mount (no signIn call)', () => {
    mockGetInitialState.mockReturnValue({ isSignedIn: true, email: 'user@gmail.com' });
    renderScreen();
    expect(mockGetInitialState).toHaveBeenCalledTimes(1);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  // Regression guard: the existing Export/Import/Reset behaviour must be wholly
  // unchanged by the additive Google Drive section.
  it('still renders the Export, Import, and Reset tiles', () => {
    const { getByText } = renderScreen();
    expect(getByText('Export Settings')).toBeTruthy();
    expect(getByText('Import Settings')).toBeTruthy();
    expect(getByText('Reset All Settings')).toBeTruthy();
  });
});

describe('BackupRestoreScreen — Cloud Backup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMany.mockImplementation((keys: string[]) => {
      const result: Record<string, string | null> = {};
      for (const k of keys) {
        result[k] = ALL_DATA[k] ?? null;
      }
      return Promise.resolve(result);
    });
    mockGetInitialState.mockReturnValue({ isSignedIn: true, email: 'user@gmail.com' });
    mockGetAccessToken.mockResolvedValue('fake-access-token');
    global.fetch = jest.fn();
  });

  // Red step for the gating rule: "Back Up Now" must do nothing while signed out —
  // no passphrase prompt, no token lookup, no network call.
  it('"Back Up Now" is disabled when signed out — no prompt, no network call', () => {
    mockGetInitialState.mockReturnValue({ isSignedIn: false, email: null });
    const { getByText, queryByPlaceholderText } = renderScreen(mockNavigation);

    fireEvent.press(getByText('Back Up Now'));

    expect(queryByPlaceholderText('Passphrase')).toBeNull();
    expect(mockGetAccessToken).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('"Back Up Now" prompts for a passphrase before any network call', () => {
    const { getByText, getByPlaceholderText } = renderScreen(mockNavigation);

    fireEvent.press(getByText('Back Up Now'));

    expect(getByPlaceholderText('Passphrase')).toBeTruthy();
    expect(mockGetAccessToken).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('backs up via createSnapshot -> encryptSnapshot -> uploadBackup once the passphrase is confirmed', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const { getByText, getByPlaceholderText, queryByText } = renderScreen(mockNavigation);

    fireEvent.press(getByText('Back Up Now'));
    fireEvent.changeText(getByPlaceholderText('Passphrase'), 'correct horse battery staple');
    fireEvent.press(getByText('Confirm'));

    await waitFor(() => expect(queryByText('Backup Uploaded')).toBeTruthy());

    // DeviceProvider (mounted globally by test-utils) also calls fetch for the
    // weather widget, so isolate the Drive upload call among all fetch calls.
    const uploadCall = (global.fetch as jest.Mock).mock.calls.find(([url]) =>
      String(url).includes('www.googleapis.com/upload/drive/v3/files'),
    );
    expect(uploadCall).toBeTruthy();
    const [url, options] = uploadCall as [string, { headers: Record<string, string>; body: string }];
    expect(url).toContain('www.googleapis.com/upload/drive/v3/files');
    expect(options.headers.Authorization).toBe('Bearer fake-access-token');
    // The passphrase itself must never reach the network request.
    expect(String(options.body)).not.toContain('correct horse battery staple');
  });

  it('shows an error and does not call uploadBackup when not signed in to Google at confirm time', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    const { getByText, getByPlaceholderText, queryByText } = renderScreen(mockNavigation);

    fireEvent.press(getByText('Back Up Now'));
    fireEvent.changeText(getByPlaceholderText('Passphrase'), 'a passphrase');
    fireEvent.press(getByText('Confirm'));

    await waitFor(() => expect(queryByText('Google Drive')).toBeTruthy());
    const uploadCall = (global.fetch as jest.Mock).mock.calls.find(([url]) =>
      String(url).includes('googleapis.com'),
    );
    expect(uploadCall).toBeUndefined();
  });

  it('lists cloud backups with their timestamps when "Restore from Cloud" is tapped', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        files: [{ id: 'file-1', name: 'iostoandroid-backup.json', createdTime: '2026-08-20T10:00:00.000Z' }],
      }),
    });
    const { getByText, queryByText } = renderScreen(mockNavigation);

    fireEvent.press(getByText('Restore from Cloud'));

    const expectedLabel = new Date('2026-08-20T10:00:00.000Z').toLocaleString();
    await waitFor(() => expect(queryByText(expectedLabel)).toBeTruthy());
  });

  // Red step for the AsyncStorage-safety guarantee: a wrong passphrase must
  // surface the existing "Invalid backup data" alert and leave AsyncStorage
  // completely untouched — applySnapshot (and therefore setMany) must never run.
  it('wrong passphrase on cloud restore shows the invalid alert and does NOT call setMany', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          files: [{ id: 'file-1', name: 'iostoandroid-backup.json', createdTime: '2026-08-20T10:00:00.000Z' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          version: 1,
          salt: 'c2FsdC1iYXNlNjQtMTZieXRlcyEh',
          iv: 'aXYtYmFzZTY0LTE2Ynl0ZXMhISEh',
          ciphertext: 'Y2lwaGVydGV4dC1iYXNlNjQ=',
        }),
      });
    const { getByText, getByPlaceholderText, queryByText } = renderScreen(mockNavigation);

    fireEvent.press(getByText('Restore from Cloud'));
    const expectedLabel = new Date('2026-08-20T10:00:00.000Z').toLocaleString();
    await waitFor(() => expect(getByText(expectedLabel)).toBeTruthy());
    fireEvent.press(getByText(expectedLabel));

    fireEvent.changeText(getByPlaceholderText('Passphrase'), 'wrong passphrase');
    fireEvent.press(getByText('Confirm'));

    await waitFor(() => expect(queryByText(/Invalid backup data/)).toBeTruthy());
    expect(mockSetMany).not.toHaveBeenCalled();
  });

  it('a Drive network failure while listing backups shows an alert and does not open the picker', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));
    const { getByText, queryByText } = renderScreen(mockNavigation);

    fireEvent.press(getByText('Restore from Cloud'));

    await waitFor(() => expect(queryByText('Restore Failed')).toBeTruthy());
    expect(mockSetMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Auto Backup (issue #283)
//
// Implements Auto Backup as a FOREGROUND-TRIGGERED reminder only (per #270 the
// passphrase must never be persisted, so there can be no silent upload). The
// reminder re-enters the SAME manual "Back Up Now" flow (#279): passphrase
// modal -> encryptSnapshot -> uploadBackup. These tests assert: toggle +
// frequency persist, the prompt appears on mount AND on a foreground
// transition when due, the prompt never uploads without a fresh passphrase,
// `lastBackupAt` is stamped only after a *successful* upload, and the
// clipboard export/import flows are untouched (regression guards).
//
// A real in-memory AsyncStorage store backs BOTH getItem and setItem so that
// the mount-time loadAutoBackupPrefs() reflects what was previously persisted,
// and a user toggle survives the async load settling.
// ---------------------------------------------------------------------------
describe('BackupRestoreScreen — Auto Backup', () => {
  let store: Map<string, string>;

  const OVERDUE = JSON.stringify({
    enabled: true,
    frequency: 'daily',
    lastBackupAt: '2000-01-01T00:00:00.000Z',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    store = new Map<string, string>();
    mockGetMany.mockImplementation((keys: string[]) => {
      const result: Record<string, string | null> = {};
      for (const k of keys) result[k] = ALL_DATA[k] ?? null;
      return Promise.resolve(result);
    });
    // Google Drive is connected by default here: the reminder drives the #279
    // upload flow, which is gated on a signed-in account.
    mockGetInitialState.mockReturnValue({ isSignedIn: true, email: 'user@gmail.com' });
    mockGetAccessToken.mockResolvedValue('fake-access-token');
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
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

  // TESTE A — isola a transição foreground (background->active) do efeito de mount.
  // Defeito original (reviewer, #787): o teste antigo semeava OVERDUE e fazia
  // fireAppState('active'), mas o mount JÁ mostrava o diálogo para OVERDUE — logo
  // remover por completo o listener AppState (linhas 117-125) DEIXAVA esse teste
  // passar, não isolando a regressão a foreground. Aqui despachamos o diálogo de
  // mount com 'Not Now' ANTES do fireAppState('active'); se o listener for
  // apagado, o diálogo não reaparece e o teste falha com
  // "Unable to find an element with text: Time for your backup".
  it('re-surfaces the "Time for your backup" prompt on a due foreground transition (not just on mount)', async () => {
    store.set(AUTO_BACKUP_STORAGE_KEY, OVERDUE);

    const { getByText, queryByText } = renderScreen();
    // Mount-time due-check surfaces the prompt for an overdue backup...
    await waitFor(() => expect(getByText('Time for your backup')).toBeTruthy());
    // ...dismiss it, so the mount effect is no longer what is keeping it up.
    fireEvent.press(getByText('Not Now'));
    await waitFor(() => expect(queryByText('Time for your backup')).toBeNull());

    // SÓ ENTÃO: a transição background -> active tem de REAPRESENTAR o diálogo,
    // provando que é o listener AppState (e não só o mount) que o invoca.
    await act(async () => {
      fireAppState('active');
    });

    expect(getByText('Time for your backup')).toBeTruthy();
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

  // TESTE B — isola a guarda active-only `if (next !== 'active') return;` (linha 119).
  // Defeito original (reviewer, #787): o teste antigo semeava lastBackupAt: now
  // (não em dívida), logo o diálogo nunca aparecia e a guarda NUNCA era
  // exercitada — passava mesmo que a guarda fosse apagada. Aqui semeamos OVERDUE,
  // despachamos o diálogo com 'Not Now', e depois de fireAppState('background') o
  // diálogo NÃO deve reaparecer. Sem a guarda, isBackupDue voltaria a dar true no
  // ramo 'background' e o diálogo reapareceria (teste falha).
  it('does NOT prompt on a non-active transition (e.g. background) even when overdue', async () => {
    store.set(AUTO_BACKUP_STORAGE_KEY, OVERDUE);

    const { getByText, queryByText } = renderScreen();
    await waitFor(() => expect(getByText('Time for your backup')).toBeTruthy());
    fireEvent.press(getByText('Not Now'));
    await waitFor(() => expect(queryByText('Time for your backup')).toBeNull());

    await act(async () => {
      fireAppState('background');
    });

    expect(queryByText('Time for your backup')).toBeNull();
  });

  // The core #270 constraint: accepting the reminder must NOT upload. It only
  // re-enters the manual flow, which asks for the passphrase first.
  it('accepting the reminder asks for a passphrase and uploads nothing on its own', async () => {
    store.set(AUTO_BACKUP_STORAGE_KEY, OVERDUE);

    const { getByText, getByPlaceholderText } = renderScreen();
    await waitFor(() => expect(getByText('Time for your backup')).toBeTruthy());

    fireEvent.press(getByText('Back Up'));

    // Passphrase modal is open...
    expect(getByPlaceholderText('Passphrase')).toBeTruthy();
    // ...and nothing has been sent to Drive, nor has any token been fetched.
    expect(mockGetAccessToken).not.toHaveBeenCalled();
    const driveCall = (global.fetch as jest.Mock).mock.calls.find(([url]) =>
      String(url).includes('googleapis.com'),
    );
    expect(driveCall).toBeUndefined();
    // The schedule is NOT stamped just because the reminder was accepted:
    // nothing at all has been written back to the auto-backup key.
    expect(loadPrefs()).toBeNull();
  });

  it('completing the reminder flow uploads via #279 and stamps lastBackupAt', async () => {
    store.set(AUTO_BACKUP_STORAGE_KEY, OVERDUE);

    const { getByText, getByPlaceholderText, queryByText } = renderScreen();
    await waitFor(() => expect(getByText('Time for your backup')).toBeTruthy());

    fireEvent.press(getByText('Back Up'));
    fireEvent.changeText(getByPlaceholderText('Passphrase'), 'correct horse battery staple');
    fireEvent.press(getByText('Confirm'));

    await waitFor(() => expect(queryByText('Backup Uploaded')).toBeTruthy());

    const uploadCall = (global.fetch as jest.Mock).mock.calls.find(([url]) =>
      String(url).includes('www.googleapis.com/upload/drive/v3/files'),
    );
    expect(uploadCall).toBeTruthy();
    // The passphrase never leaves the device in the clear...
    const [, options] = uploadCall as [string, { body: string }];
    expect(String(options.body)).not.toContain('correct horse battery staple');
    // ...and is never persisted alongside the schedule.
    const stamped = loadPrefs();
    expect(stamped).not.toHaveProperty('passphrase');
    expect(stamped.lastBackupAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(Number.isNaN(Date.parse(stamped.lastBackupAt))).toBe(false);
  });

  // Inverse of the fix: a FAILED upload must leave the schedule alone, so the
  // reminder fires again instead of silently pretending the backup happened.
  it('a failed upload does NOT stamp lastBackupAt', async () => {
    store.set(AUTO_BACKUP_STORAGE_KEY, OVERDUE);
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));

    const { getByText, getByPlaceholderText, queryByText } = renderScreen();
    await waitFor(() => expect(getByText('Time for your backup')).toBeTruthy());

    fireEvent.press(getByText('Back Up'));
    fireEvent.changeText(getByPlaceholderText('Passphrase'), 'a passphrase');
    fireEvent.press(getByText('Confirm'));

    await waitFor(() => expect(queryByText('Cloud Backup Failed')).toBeTruthy());
    expect(loadPrefs()).toBeNull();
  });

  // Drive not connected: the reminder must say so rather than opening a
  // passphrase modal whose upload can only fail.
  it('accepting the reminder while Google Drive is disconnected explains instead of prompting', async () => {
    mockGetInitialState.mockReturnValue({ isSignedIn: false, email: null });
    store.set(AUTO_BACKUP_STORAGE_KEY, OVERDUE);

    const { getByText, queryByPlaceholderText, queryByText } = renderScreen();
    await waitFor(() => expect(getByText('Time for your backup')).toBeTruthy());

    fireEvent.press(getByText('Back Up'));

    await waitFor(() =>
      expect(queryByText('Connect Google Drive to run your scheduled backup.')).toBeTruthy(),
    );
    expect(queryByPlaceholderText('Passphrase')).toBeNull();
    expect(mockGetAccessToken).not.toHaveBeenCalled();
  });

  // Repetition guard: the reminder is dismissible and dismissing it twice in a
  // row must not leave a half-open dialog or re-arm itself without a new event.
  it('dismissing the reminder with "Not Now" leaves nothing pending and writes nothing', async () => {
    store.set(AUTO_BACKUP_STORAGE_KEY, OVERDUE);

    const { getByText, queryByText } = renderScreen();
    await waitFor(() => expect(getByText('Time for your backup')).toBeTruthy());

    fireEvent.press(getByText('Not Now'));
    await waitFor(() => expect(queryByText('Time for your backup')).toBeNull());

    expect(loadPrefs()).toBeNull();
  });

  // --- Regression guards (issue #283 acceptance criteria) -----------------

  // The clipboard export (#269) is a different feature: it must never move the
  // Auto Backup schedule, even with Auto Backup ON and overdue.
  it('clipboard export does NOT stamp lastBackupAt even with Auto Backup ON', async () => {
    store.set(AUTO_BACKUP_STORAGE_KEY, OVERDUE);

    const { getByText } = renderScreen();
    await waitFor(() => expect(getByText('Time for your backup')).toBeTruthy());
    fireEvent.press(getByText('Not Now'));

    fireEvent.press(getByText('Export Settings'));
    await waitFor(() => expect(getByText('Export')).toBeTruthy());
    fireEvent.press(getByText('Export'));
    await waitFor(() => expect(mockSetStringAsync).toHaveBeenCalled());

    expect(loadPrefs()).toBeNull();
  });

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

