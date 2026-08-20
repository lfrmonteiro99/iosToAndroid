import React from 'react';
import { render, fireEvent, waitFor } from '../../../test-utils';
import { BackupRestoreScreen } from '../BackupRestoreScreen';

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
