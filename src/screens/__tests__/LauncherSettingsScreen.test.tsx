import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { LauncherSettingsScreen } from '../LauncherSettingsScreen';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

// Stateful in-memory AsyncStorage mock: setItem persists so a subsequent
// getItem returns what was written — unlike the stateless default mock.
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

async function submitPinFlow(getByText: (t: string) => unknown, getByPlaceholderText: (t: string) => unknown) {
  fireEvent.press(getByText('Change Passcode'));
  // Each step transition is async (the handler awaits SecureStore/AsyncStorage),
  // so wait for the modal title to change before driving the next step.
  // Step 1 — current passcode (none set, proceeds)
  fireEvent.changeText(getByPlaceholderText('••••'), '1234');
  fireEvent.press(getByText('Next'));
  await waitFor(() => expect(getByText('Enter New Passcode')).toBeTruthy());
  // Step 2 — new passcode
  fireEvent.changeText(getByPlaceholderText('••••'), '5678');
  fireEvent.press(getByText('Next'));
  await waitFor(() => expect(getByText('Confirm New Passcode')).toBeTruthy());
  // Step 3 — confirm new passcode
  fireEvent.changeText(getByPlaceholderText('••••'), '5678');
  fireEvent.press(getByText('Next'));
}

describe('LauncherSettingsScreen', () => {
  it('falls back to the NAMESPACED AsyncStorage key when SecureStore is unavailable', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('SecureStore unavailable'));
    const store = setupMemoryAsyncStorage();

    const { getByText, getByPlaceholderText } = render(<LauncherSettingsScreen />);
    await submitPinFlow(getByText, getByPlaceholderText);

    await waitFor(() => {
      expect(store.get('@iostoandroid/lock_pin')).toBe('5678');
    });
    // The legacy key must never be written again
    expect(store.has('@lock_pin')).toBe(false);
  });

  it('removes BOTH AsyncStorage PIN keys when the PIN is stored in SecureStore', async () => {
    const store = setupMemoryAsyncStorage({
      '@iostoandroid/lock_pin': '1111',
      '@lock_pin': '2222',
    });

    const { getByText, getByPlaceholderText } = render(<LauncherSettingsScreen />);
    fireEvent.press(getByText('Change Passcode'));
    // Step 1 — current passcode lives in the namespaced key (1111)
    fireEvent.changeText(getByPlaceholderText('••••'), '1111');
    fireEvent.press(getByText('Next'));
    await waitFor(() => expect(getByText('Enter New Passcode')).toBeTruthy());
    // Step 2 — new passcode
    fireEvent.changeText(getByPlaceholderText('••••'), '5678');
    fireEvent.press(getByText('Next'));
    await waitFor(() => expect(getByText('Confirm New Passcode')).toBeTruthy());
    // Step 3 — confirm new passcode → stored in SecureStore, AsyncStorage copies dropped
    fireEvent.changeText(getByPlaceholderText('••••'), '5678');
    fireEvent.press(getByText('Next'));

    await waitFor(() => {
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('lock_pin', '5678');
    });
    expect(store.has('@iostoandroid/lock_pin')).toBe(false);
    expect(store.has('@lock_pin')).toBe(false);
  });

  it('accepts the current PIN stored in the namespaced key (read order: SecureStore → new → legacy)', async () => {
    const store = setupMemoryAsyncStorage({
      '@iostoandroid/lock_pin': '1234',
      '@lock_pin': '9999',
    });

    const { getByText, getByPlaceholderText } = render(<LauncherSettingsScreen />);
    fireEvent.press(getByText('Change Passcode'));

    // Enter the PIN from the namespaced key — it must be accepted (advances to "new" step)
    fireEvent.changeText(getByPlaceholderText('••••'), '1234');
    fireEvent.press(getByText('Next'));

    await waitFor(() => {
      expect(getByText('Enter New Passcode')).toBeTruthy();
    });
    expect(store.has('@iostoandroid/lock_pin')).toBe(true);
  });
});
