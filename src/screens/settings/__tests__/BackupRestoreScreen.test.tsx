import React from 'react';
import { render, fireEvent, waitFor } from '../../../test-utils';
import { BackupRestoreScreen } from '../BackupRestoreScreen';
import { AlertProvider } from '../../../components/AlertProvider';

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
