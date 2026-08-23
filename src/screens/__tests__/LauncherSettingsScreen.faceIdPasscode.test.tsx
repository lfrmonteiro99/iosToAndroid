import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import { within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { LauncherSettingsScreen } from '../LauncherSettingsScreen';

// #611 — «Face ID & Passcode»: toggle "Face ID for Unlock" e picker
// "Require Passcode" na secção Lock Screen das Launcher Settings.

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

const SETTINGS_KEY = '@iostoandroid/settings';

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

// Espera até o blob persistido satisfazer o predicado — o provider grava os
// defaults no mount, por isso «houve uma escrita» não prova nada.
async function waitForPersisted(
  store: Map<string, string>,
  predicate: (settings: Record<string, unknown>) => boolean,
) {
  await waitFor(() => {
    const raw = store.get(SETTINGS_KEY);
    expect(raw).toBeTruthy();
    expect(predicate(JSON.parse(raw as string))).toBe(true);
  }, { timeout: 3000 });
  return JSON.parse(store.get(SETTINGS_KEY) as string);
}

beforeEach(() => {
  jest.clearAllMocks();
  setupMemoryAsyncStorage();
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
});

describe('LauncherSettingsScreen — Face ID & Passcode (#611)', () => {
  it('mostra "Face ID for Unlock" ligado por omissão', async () => {
    const { getByLabelText } = render(<LauncherSettingsScreen />);
    const tile = await waitFor(() => getByLabelText('Face ID for Unlock'));
    expect(within(tile).getByRole('switch').props.accessibilityState.checked).toBe(true);
  });

  it('desligar "Face ID for Unlock" persiste faceIdForUnlock=false', async () => {
    const store = setupMemoryAsyncStorage();
    const { getByLabelText } = render(<LauncherSettingsScreen />);

    const sw = within(getByLabelText('Face ID for Unlock')).getByRole('switch');
    fireEvent.press(sw);

    await waitFor(() =>
      expect(
        within(getByLabelText('Face ID for Unlock')).getByRole('switch').props.accessibilityState.checked,
      ).toBe(false),
    );
    await waitForPersisted(store, (s) => s.faceIdForUnlock === false);
  });

  it('mostra "Require Passcode" com o valor "Immediately" por omissão', async () => {
    const { getByLabelText, getByText } = render(<LauncherSettingsScreen />);
    await waitFor(() => expect(getByLabelText('Require Passcode')).toBeTruthy());
    expect(getByText('Immediately')).toBeTruthy();
  });

  it('escolher "After 5 minutes" no picker persiste requirePasscodeAfter=5min e actualiza o valor mostrado', async () => {
    const store = setupMemoryAsyncStorage();
    const { getByLabelText, getByText } = render(<LauncherSettingsScreen />);

    fireEvent.press(getByLabelText('Require Passcode'));
    await waitFor(() => expect(getByText('After 5 minutes')).toBeTruthy());
    fireEvent.press(getByText('After 5 minutes'));

    await waitForPersisted(store, (s) => s.requirePasscodeAfter === '5min');
    await waitFor(() =>
      expect(within(getByLabelText('Require Passcode')).getByText('After 5 minutes')).toBeTruthy(),
    );
  });

  it('o picker oferece as seis opções do iOS, de imediato a 4 horas', async () => {
    const { getByLabelText, getByText, getAllByText } = render(<LauncherSettingsScreen />);
    fireEvent.press(getByLabelText('Require Passcode'));
    await waitFor(() => expect(getByText('After 1 minute')).toBeTruthy());
    // 'Immediately' aparece duas vezes: no valor do tile e na opção do sheet.
    expect(getAllByText('Immediately').length).toBe(2);
    for (const label of [
      'After 1 minute',
      'After 5 minutes',
      'After 15 minutes',
      'After 1 hour',
      'After 4 hours',
    ]) {
      expect(getByText(label)).toBeTruthy();
    }
  });

  it('lê o valor persistido de um arranque anterior em vez do default', async () => {
    setupMemoryAsyncStorage({
      [SETTINGS_KEY]: JSON.stringify({ requirePasscodeAfter: '1hour', faceIdForUnlock: false }),
    });

    const { getByLabelText } = render(<LauncherSettingsScreen />);

    await waitFor(() =>
      expect(within(getByLabelText('Require Passcode')).getByText('After 1 hour')).toBeTruthy(),
    );
    expect(
      within(getByLabelText('Face ID for Unlock')).getByRole('switch').props.accessibilityState.checked,
    ).toBe(false);
  });

  it('um requirePasscodeAfter corrompido no armazenamento cai em "Immediately"', async () => {
    setupMemoryAsyncStorage({
      [SETTINGS_KEY]: JSON.stringify({ requirePasscodeAfter: 'depois-do-almoço' }),
    });

    const { getByLabelText } = render(<LauncherSettingsScreen />);

    await waitFor(() =>
      expect(within(getByLabelText('Require Passcode')).getByText('Immediately')).toBeTruthy(),
    );
  });

  it('"Biometric Unlock" continua a ser o master on/off e mantém-se independente do Face ID', async () => {
    const store = setupMemoryAsyncStorage();
    const { getByLabelText } = render(<LauncherSettingsScreen />);

    fireEvent.press(within(getByLabelText('Biometric Unlock')).getByRole('switch'));

    await waitForPersisted(store, (s) => s.biometricUnlock === false);
    // O inverso do fix: desligar o master não desliga o Face ID toggle.
    expect(
      within(getByLabelText('Face ID for Unlock')).getByRole('switch').props.accessibilityState.checked,
    ).toBe(true);
  });
});
