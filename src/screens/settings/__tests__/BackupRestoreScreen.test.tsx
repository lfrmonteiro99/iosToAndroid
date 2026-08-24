import React from 'react';
import { render, fireEvent, waitFor } from '../../../test-utils';
import { BackupRestoreScreen } from '../BackupRestoreScreen';
import { AlertProvider } from '../../../components/AlertProvider';

// BackupRestoreScreen uses useAlert() for its error/success dialogs. The shared
// test-utils wrapper does not mount AlertProvider, so useAlert() is a no-op there
// and the "Invalid backup data" alert would never reach the DOM. Wrap with
// AlertProvider so the alert dialog actually renders and can be asserted.
const renderScreen = (navigation: unknown) =>
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
