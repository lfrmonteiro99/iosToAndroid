import React from 'react';
import { render, fireEvent, waitFor, within } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { LauncherSettingsScreen } from '../LauncherSettingsScreen';
import { AccentColors } from '../../theme/CupertinoTheme';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

// Stateful in-memory AsyncStorage mock (mirrors LauncherSettingsScreen.test.tsx):
// setItem persists so a subsequent getItem returns what was written.
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
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
});

// issue #620: «Tinted Icons» toggle + colour picker in the Appearance section.
describe('LauncherSettingsScreen Tinted Icons (#620)', () => {
  it('renders the "Tinted Icons" switch in Appearance, default OFF', () => {
    const { getByLabelText } = render(<LauncherSettingsScreen />);
    const tile = getByLabelText('Tinted Icons');
    const sw = within(tile).getByRole('switch');
    expect(sw.props.accessibilityState.checked).toBe(false);
  });

  it('does not show a colour picker tile while Tinted Icons is off', () => {
    const { queryByLabelText } = render(<LauncherSettingsScreen />);
    expect(queryByLabelText('Tint Color')).toBeNull();
  });

  it('reveals the "Tint Color" tile once Tinted Icons is turned on, and persists the toggle', async () => {
    const store = setupMemoryAsyncStorage();
    const { getByLabelText, queryByLabelText } = render(<LauncherSettingsScreen />);

    fireEvent.press(within(getByLabelText('Tinted Icons')).getByRole('switch'));

    await waitFor(() => expect(queryByLabelText('Tint Color')).toBeTruthy());

    await waitFor(() => {
      const raw = store.get('@iostoandroid/settings');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw as string).iconTintEnabled).toBe(true);
    });
  });

  it('picking a colour from the action sheet updates iconTintColor and persists it', async () => {
    const store = setupMemoryAsyncStorage();
    const { getByLabelText, getByText, queryByLabelText } = render(<LauncherSettingsScreen />);

    fireEvent.press(within(getByLabelText('Tinted Icons')).getByRole('switch'));
    await waitFor(() => expect(queryByLabelText('Tint Color')).toBeTruthy());

    fireEvent.press(getByLabelText('Tint Color'));
    fireEvent.press(getByText('Purple'));

    await waitFor(() => {
      const raw = store.get('@iostoandroid/settings');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw as string).iconTintColor).toBe(AccentColors.purple.light);
    });
  });

  it('turning Tinted Icons back off hides the colour picker again (inverse of the fix)', async () => {
    const { getByLabelText, queryByLabelText } = render(<LauncherSettingsScreen />);

    const sw = () => within(getByLabelText('Tinted Icons')).getByRole('switch');
    fireEvent.press(sw());
    await waitFor(() => expect(queryByLabelText('Tint Color')).toBeTruthy());

    fireEvent.press(sw());
    await waitFor(() => expect(queryByLabelText('Tint Color')).toBeNull());
  });
});
