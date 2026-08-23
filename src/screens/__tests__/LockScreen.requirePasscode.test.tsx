import React from 'react';
import { render, waitFor, act } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuth from 'expo-local-authentication';
import { LockScreen } from '../LockScreen';

// #611 — «Require Passcode after»: dentro do intervalo escolhido o desbloqueio
// não deve pedir biometria nem passcode; passado o intervalo, pede.

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: false })),
}));

const SETTINGS_KEY = '@iostoandroid/settings';
const LAST_UNLOCK_KEY = '@iostoandroid/last_unlock_at';

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

/** Deixa correr os efeitos assíncronos de mount sem afirmar nada. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setupMemoryAsyncStorage();
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
  (LocalAuth.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
  (LocalAuth.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
  (LocalAuth.authenticateAsync as jest.Mock).mockResolvedValue({ success: false });
});

describe('LockScreen — Require Passcode after (#611)', () => {
  it('não pede autenticação quando o último desbloqueio foi dentro do intervalo', async () => {
    setupMemoryAsyncStorage({
      [SETTINGS_KEY]: JSON.stringify({ requirePasscodeAfter: '5min' }),
      [LAST_UNLOCK_KEY]: String(Date.now() - 60_000),
    });

    const { queryByText } = render(<LockScreen />);
    await settle();

    expect(LocalAuth.authenticateAsync).not.toHaveBeenCalled();
    expect(queryByText('Enter Passcode')).toBeNull();
  });

  it('pede autenticação quando o intervalo já passou', async () => {
    setupMemoryAsyncStorage({
      [SETTINGS_KEY]: JSON.stringify({ requirePasscodeAfter: '5min' }),
      [LAST_UNLOCK_KEY]: String(Date.now() - 6 * 60_000),
    });

    render(<LockScreen />);

    await waitFor(() => expect(LocalAuth.authenticateAsync).toHaveBeenCalled());
  });

  it('pede autenticação com "immediately" mesmo com um desbloqueio há um instante', async () => {
    setupMemoryAsyncStorage({
      [SETTINGS_KEY]: JSON.stringify({ requirePasscodeAfter: 'immediately' }),
      [LAST_UNLOCK_KEY]: String(Date.now() - 1_000),
    });

    render(<LockScreen />);

    await waitFor(() => expect(LocalAuth.authenticateAsync).toHaveBeenCalled());
  });

  it('pede autenticação num arranque a frio (sem registo de desbloqueio)', async () => {
    setupMemoryAsyncStorage({
      [SETTINGS_KEY]: JSON.stringify({ requirePasscodeAfter: '4hours' }),
    });

    render(<LockScreen />);

    await waitFor(() => expect(LocalAuth.authenticateAsync).toHaveBeenCalled());
  });

  it('faceIdForUnlock=false salta a biometria e vai directo à passcode', async () => {
    setupMemoryAsyncStorage({
      [SETTINGS_KEY]: JSON.stringify({ faceIdForUnlock: false }),
    });

    const { getByText } = render(<LockScreen />);

    await waitFor(() => expect(getByText('Enter Passcode')).toBeTruthy());
    expect(LocalAuth.authenticateAsync).not.toHaveBeenCalled();
  });

  it('biometricUnlock=false (master off) salta a biometria mesmo com faceIdForUnlock=true', async () => {
    setupMemoryAsyncStorage({
      [SETTINGS_KEY]: JSON.stringify({ biometricUnlock: false, faceIdForUnlock: true }),
    });

    const { getByText } = render(<LockScreen />);

    await waitFor(() => expect(getByText('Enter Passcode')).toBeTruthy());
    expect(LocalAuth.authenticateAsync).not.toHaveBeenCalled();
  });

  it('registra o instante do desbloqueio para a próxima decisão', async () => {
    const store = setupMemoryAsyncStorage({
      [SETTINGS_KEY]: JSON.stringify({ requirePasscodeAfter: '5min' }),
    });
    (LocalAuth.authenticateAsync as jest.Mock).mockResolvedValue({ success: true });
    const onUnlock = jest.fn();

    render(<LockScreen onUnlock={onUnlock} />);

    await waitFor(() => expect(onUnlock).toHaveBeenCalled());
    await waitFor(() => expect(store.has(LAST_UNLOCK_KEY)).toBe(true));
    expect(Number(store.get(LAST_UNLOCK_KEY))).toBeGreaterThan(0);
  });

  it('um valor corrompido em last_unlock_at é tratado como ausente e exige autenticação', async () => {
    setupMemoryAsyncStorage({
      [SETTINGS_KEY]: JSON.stringify({ requirePasscodeAfter: '4hours' }),
      [LAST_UNLOCK_KEY]: 'ontem à tarde',
    });

    render(<LockScreen />);

    await waitFor(() => expect(LocalAuth.authenticateAsync).toHaveBeenCalled());
  });

  it('um last_unlock_at no futuro (relógio para trás) exige autenticação', async () => {
    setupMemoryAsyncStorage({
      [SETTINGS_KEY]: JSON.stringify({ requirePasscodeAfter: '4hours' }),
      [LAST_UNLOCK_KEY]: String(Date.now() + 60 * 60_000),
    });

    render(<LockScreen />);

    await waitFor(() => expect(LocalAuth.authenticateAsync).toHaveBeenCalled());
  });
});
