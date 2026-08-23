import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, fireEvent, waitFor, within } from '../../test-utils';
import { LauncherSettingsScreen } from '../LauncherSettingsScreen';

// issue #605: Home Screen & Dock → "Show Status Bar" toggle, bound to
// settings.statusBarVisible (default true = shown).

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

function setupMemoryAsyncStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
    store.has(key) ? store.get(key) : null,
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
    store.delete(key);
  });
  return store;
}

beforeEach(() => {
  jest.clearAllMocks();
  setupMemoryAsyncStorage();
});

describe('LauncherSettingsScreen — Show Status Bar (#605)', () => {
  it('renders a "Show Status Bar" switch in the Home Screen section, default ON', () => {
    const { getByLabelText } = render(<LauncherSettingsScreen />);
    const tile = getByLabelText('Show Status Bar');
    const sw = within(tile).getByRole('switch');
    expect(sw.props.accessibilityState.checked).toBe(true);
  });

  it('toggles Show Status Bar off and persists it to AsyncStorage', async () => {
    const store = setupMemoryAsyncStorage();

    const { getByLabelText } = render(<LauncherSettingsScreen />);
    const sw = within(getByLabelText('Show Status Bar')).getByRole('switch');

    fireEvent.press(sw);

    await waitFor(() => {
      expect(
        within(getByLabelText('Show Status Bar')).getByRole('switch').props.accessibilityState.checked,
      ).toBe(false);
    });

    await waitFor(() => {
      const raw = store.get('@iostoandroid/settings');
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw as string);
      expect(parsed.statusBarVisible).toBe(false);
    });
  });

  it('leaves statusBarVisible defaulting true when nothing is toggled', async () => {
    const store = setupMemoryAsyncStorage();
    render(<LauncherSettingsScreen />);

    await waitFor(() => {
      const raw = store.get('@iostoandroid/settings');
      if (raw) expect(JSON.parse(raw).statusBarVisible ?? true).toBe(true);
    });
  });
});
