import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { LockScreen } from '../LockScreen';

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

describe('LockScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<LockScreen />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders flashlight button', () => {
    const { getByLabelText } = render(<LockScreen />);
    expect(getByLabelText('Flashlight')).toBeTruthy();
  });

  it('renders camera button', () => {
    const { getByLabelText } = render(<LockScreen />);
    expect(getByLabelText('Camera')).toBeTruthy();
  });

  it('renders Use Passcode button', () => {
    const { getByLabelText } = render(<LockScreen />);
    expect(getByLabelText('Use passcode to unlock')).toBeTruthy();
  });

  it('shows passcode numpad when Use Passcode is pressed', () => {
    const { getByLabelText, getByText } = render(<LockScreen />);
    fireEvent.press(getByLabelText('Use passcode to unlock'));
    expect(getByText('Enter Passcode')).toBeTruthy();
  });

  it('passcode numpad has digit buttons', () => {
    const { getByLabelText } = render(<LockScreen />);
    fireEvent.press(getByLabelText('Use passcode to unlock'));
    expect(getByLabelText('Digit 1')).toBeTruthy();
    expect(getByLabelText('Digit 0')).toBeTruthy();
    expect(getByLabelText('Delete')).toBeTruthy();
  });

  it('calls onUnlock when correct PIN entered', async () => {
    const onUnlock = jest.fn();
    const { getByLabelText } = render(<LockScreen onUnlock={onUnlock} />);
    fireEvent.press(getByLabelText('Use passcode to unlock'));
    // Default PIN is 1234
    fireEvent.press(getByLabelText('Digit 1'));
    fireEvent.press(getByLabelText('Digit 2'));
    fireEvent.press(getByLabelText('Digit 3'));
    fireEvent.press(getByLabelText('Digit 4'));
    // Allow async AsyncStorage check to resolve
    await new Promise(r => setTimeout(r, 100));
    expect(onUnlock).toHaveBeenCalled();
  });

  it('cancel hides passcode overlay', () => {
    const { getByLabelText, queryByText } = render(<LockScreen />);
    fireEvent.press(getByLabelText('Use passcode to unlock'));
    fireEvent.press(getByLabelText('Cancel passcode entry'));
    expect(queryByText('Enter Passcode')).toBeNull();
  });

  it('migrates a PIN from the namespaced AsyncStorage key to SecureStore on mount', async () => {
    const store = setupMemoryAsyncStorage({ '@iostoandroid/lock_pin': '1234' });

    render(<LockScreen />);

    await waitFor(() => {
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('lock_pin', '1234');
    });
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@iostoandroid/lock_pin');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@lock_pin');
    expect(store.has('@iostoandroid/lock_pin')).toBe(false);
    expect(store.has('@lock_pin')).toBe(false);
  });

  it('migrates a PIN from the legacy AsyncStorage key to SecureStore on mount', async () => {
    const store = setupMemoryAsyncStorage({ '@lock_pin': '4321' });

    render(<LockScreen />);

    await waitFor(() => {
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('lock_pin', '4321');
    });
    expect(store.has('@lock_pin')).toBe(false);
  });

  it('does not overwrite a SecureStore PIN when a stored copy exists', async () => {
    setupMemoryAsyncStorage({ '@iostoandroid/lock_pin': '1111' });
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('9999');

    render(<LockScreen />);

    await new Promise((r) => setTimeout(r, 50));
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@iostoandroid/lock_pin');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@lock_pin');
  });

  it('unlocks with a PIN stored only in the namespaced key when SecureStore is unavailable', async () => {
    // Fully-broken SecureStore: reads and writes both throw, so the AsyncStorage
    // copy is the only PIN source and the mount-migration cannot run.
    setupMemoryAsyncStorage({ '@iostoandroid/lock_pin': '1234', '@lock_pin': '9999' });
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('SecureStore unavailable'));
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('SecureStore unavailable'));
    const onUnlock = jest.fn();

    const { getByLabelText } = render(<LockScreen onUnlock={onUnlock} />);
    fireEvent.press(getByLabelText('Use passcode to unlock'));
    fireEvent.press(getByLabelText('Digit 1'));
    fireEvent.press(getByLabelText('Digit 2'));
    fireEvent.press(getByLabelText('Digit 3'));
    fireEvent.press(getByLabelText('Digit 4'));

    await waitFor(() => expect(onUnlock).toHaveBeenCalled());
  });
});
