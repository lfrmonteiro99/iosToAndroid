import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import * as SecureStore from 'expo-secure-store';
import { CardEditScreen, detectCardBrand } from '../CardEditScreen';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    canGoBack: jest.fn(() => false),
    getParent: () => ({ navigate: jest.fn() }),
  }),
  useRoute: () => ({ params: {} }),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
}));

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
});

function fillValidCard(
  getByPlaceholderText: (t: string) => { props: { onChangeText?: (v: string) => void } },
  overrides?: { number?: string; expiry?: string; cvv?: string },
) {
  fireEvent.changeText(getByPlaceholderText('Card Number'), overrides?.number ?? '4242424242424242');
  fireEvent.changeText(getByPlaceholderText('MM/YY'), overrides?.expiry ?? '1230');
  fireEvent.changeText(getByPlaceholderText('CVV'), overrides?.cvv ?? '123');
}

describe('detectCardBrand (pure brand sniffer)', () => {
  it('recognises Visa (leading 4)', () => {
    expect(detectCardBrand('4242424242424242')).toBe('visa');
  });

  it('recognises Amex (leading 34 or 37)', () => {
    expect(detectCardBrand('340000000000009')).toBe('amex');
    expect(detectCardBrand('370000000000002')).toBe('amex');
  });

  it('recognises Mastercard old range (51-55)', () => {
    expect(detectCardBrand('5100000000000008')).toBe('mastercard');
    expect(detectCardBrand('5500000000000004')).toBe('mastercard');
  });

  it('recognises Mastercard new range (2221-2720) at its exact boundaries', () => {
    expect(detectCardBrand('2221000000000009')).toBe('mastercard');
    expect(detectCardBrand('2720000000000004')).toBe('mastercard');
  });

  it('rejects numbers one step outside the Mastercard new range', () => {
    expect(detectCardBrand('2220000000000000')).toBe('other');
    expect(detectCardBrand('2721000000000000')).toBe('other');
  });

  it('falls back to "other" for unrecognised or empty input', () => {
    expect(detectCardBrand('6011000000000004')).toBe('other'); // Discover — out of scope
    expect(detectCardBrand('')).toBe('other');
  });
});

describe('CardEditScreen', () => {
  it('renders the Add Card title with empty fields', () => {
    const { getByText, getByPlaceholderText } = render(<CardEditScreen />);

    expect(getByText('Add Card')).toBeTruthy();
    expect(getByPlaceholderText('Card Number').props.value).toBe('');
  });

  it('keeps Done disabled and does not save while fields are incomplete', () => {
    const { getByLabelText, getByPlaceholderText } = render(<CardEditScreen />);

    fireEvent.changeText(getByPlaceholderText('Card Number'), '4242424242424242');
    // expiry and CVV still empty
    fireEvent.press(getByLabelText('Done'));

    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('rejects a card number below the minimum digit count (12 digits)', () => {
    const { getByLabelText, getByPlaceholderText } = render(<CardEditScreen />);

    fillValidCard(getByPlaceholderText, { number: '424242424242' }); // 12 digits
    fireEvent.press(getByLabelText('Done'));

    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('accepts a card number at the minimum digit count (13 digits)', async () => {
    const { getByLabelText, getByPlaceholderText } = render(<CardEditScreen />);

    fillValidCard(getByPlaceholderText, { number: '4242424242424' }); // 13 digits
    fireEvent.press(getByLabelText('Done'));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1));
  });

  it('rejects an expiry month of 00 or 13', () => {
    const { getByLabelText, getByPlaceholderText } = render(<CardEditScreen />);

    fillValidCard(getByPlaceholderText, { expiry: '0030' });
    fireEvent.press(getByLabelText('Done'));
    expect(mockGoBack).not.toHaveBeenCalled();

    fillValidCard(getByPlaceholderText, { expiry: '1330' });
    fireEvent.press(getByLabelText('Done'));
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('rejects a 2-digit CVV and accepts a 3-digit CVV', async () => {
    const { getByLabelText, getByPlaceholderText } = render(<CardEditScreen />);

    fillValidCard(getByPlaceholderText, { cvv: '12' });
    fireEvent.press(getByLabelText('Done'));
    expect(mockGoBack).not.toHaveBeenCalled();

    fillValidCard(getByPlaceholderText, { cvv: '123' });
    fireEvent.press(getByLabelText('Done'));
    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1));
  });

  it('derives brand and shows a masked last-4 preview as the number is typed', () => {
    const { getByText, getByPlaceholderText } = render(<CardEditScreen />);

    fireEvent.changeText(getByPlaceholderText('Card Number'), '4242424242424242');

    expect(getByText('Visa •••• 4242')).toBeTruthy();
  });

  it('falls back to a derived label ("Visa •••• 4242") when no custom label is entered', async () => {
    const { getByLabelText, getByPlaceholderText } = render(<CardEditScreen />);

    fillValidCard(getByPlaceholderText);
    fireEvent.press(getByLabelText('Done'));

    await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalled());
    const [, json] = (SecureStore.setItemAsync as jest.Mock).mock.calls[0];
    expect(json).toContain('Visa •••• 4242');
  });

  it('uses the custom label when one is entered', async () => {
    const { getByLabelText, getByPlaceholderText } = render(<CardEditScreen />);

    fireEvent.changeText(getByPlaceholderText('Label (e.g. Personal Visa)'), 'Personal Visa');
    fillValidCard(getByPlaceholderText);
    fireEvent.press(getByLabelText('Done'));

    await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalled());
    const [, json] = (SecureStore.setItemAsync as jest.Mock).mock.calls[0];
    expect(json).toContain('Personal Visa');
  });

  // The hard constraint from #285: the full PAN and the CVV must never reach
  // SecureStore, no matter what was typed into the form. This exercises the
  // REAL component through the REAL CardProvider (via test-utils), not a
  // reimplementation of the persistence logic.
  it('never persists the full card number or the CVV typed into the form', async () => {
    const fullNumber = '4242424242424242';
    const cvv = '987';
    const { getByLabelText, getByPlaceholderText } = render(<CardEditScreen />);

    fillValidCard(getByPlaceholderText, { number: fullNumber, cvv });
    fireEvent.press(getByLabelText('Done'));

    await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalled());
    const [, json] = (SecureStore.setItemAsync as jest.Mock).mock.calls[0];

    expect(json).not.toContain(fullNumber);
    expect(json).not.toContain(cvv);
    expect(json).not.toMatch(/cardNumber|"pan"|cvv/i);
  });

  it('navigates back on Cancel without saving', async () => {
    const { getByLabelText, getByPlaceholderText } = render(<CardEditScreen />);

    fillValidCard(getByPlaceholderText);
    fireEvent.press(getByLabelText('Cancel'));

    expect(mockGoBack).toHaveBeenCalledTimes(1);

    // The store's ready-flip alone writes an empty array ('[]'); Cancel must
    // never cause a card object to be written.
    await waitFor(() => {
      const calls = (SecureStore.setItemAsync as jest.Mock).mock.calls as [string, string][];
      const wroteACard = calls.some(([, json]) => JSON.parse(json).length > 0);
      expect(wroteACard).toBe(false);
    });
  });
});
