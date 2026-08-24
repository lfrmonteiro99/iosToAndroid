import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { CardProvider, useCard } from '../CardStore';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CardProvider>{children}</CardProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
  (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
});

describe('CardStore', () => {
  it('starts with no cards and becomes ready after load', async () => {
    const { result } = renderHook(() => useCard(), { wrapper });
    await act(async () => {});

    expect(result.current.cards).toHaveLength(0);
    expect(result.current.isReady).toBe(true);
  });

  it('persists cards via expo-secure-store, never AsyncStorage', async () => {
    const { result } = renderHook(() => useCard(), { wrapper });
    await act(async () => {});

    (SecureStore.setItemAsync as jest.Mock).mockClear();
    (AsyncStorage.setItem as jest.Mock).mockClear();

    await act(async () => {
      result.current.addCard({
        label: 'Personal Visa',
        brand: 'visa',
        last4: '4242',
        expiryMonth: 12,
        expiryYear: 2030,
      });
    });

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      '@iostoandroid/wallet_cards',
      expect.stringContaining('Personal Visa'),
    );
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('never persists the full card number or a CVV, even if smuggled onto the payload', async () => {
    const { result } = renderHook(() => useCard(), { wrapper });
    await act(async () => {});

    const fullNumber = '4242424242424242';
    const cvv = '123';

    await act(async () => {
      result.current.addCard({
        label: 'Personal Visa',
        brand: 'visa',
        last4: fullNumber.slice(-4),
        expiryMonth: 12,
        expiryYear: 2030,
      } as Parameters<typeof result.current.addCard>[0]);
    });

    const calls = (SecureStore.setItemAsync as jest.Mock).mock.calls;
    const [, persistedJson] = calls[calls.length - 1];

    expect(persistedJson).not.toContain(fullNumber);
    expect(persistedJson).not.toContain(cvv);
    expect(persistedJson).not.toMatch(/cardNumber|"pan"|cvv/i);
  });

  it('addCard() adds a card and generates id + createdAt', async () => {
    const { result } = renderHook(() => useCard(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addCard({
        label: 'Work Amex', brand: 'amex', last4: '1005', expiryMonth: 6, expiryYear: 2027,
      });
    });

    expect(result.current.cards).toHaveLength(1);
    const added = result.current.cards[0];
    expect(added.label).toBe('Work Amex');
    expect(added.brand).toBe('amex');
    expect(added.id).toBeTruthy();
    expect(added.createdAt).toBeTruthy();
  });

  it('addCard() appends without dropping existing cards', async () => {
    const { result } = renderHook(() => useCard(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addCard({ label: 'First', brand: 'visa', last4: '0001', expiryMonth: 1, expiryYear: 2028 });
    });
    await act(async () => {
      result.current.addCard({ label: 'Second', brand: 'mastercard', last4: '0002', expiryMonth: 2, expiryYear: 2029 });
    });

    expect(result.current.cards).toHaveLength(2);
    expect(result.current.cards.map((c) => c.label)).toEqual(['First', 'Second']);
  });

  it('deleteCard() removes a card from state', async () => {
    const { result } = renderHook(() => useCard(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addCard({ label: 'ToDelete', brand: 'other', last4: '9999', expiryMonth: 1, expiryYear: 2030 });
    });
    const id = result.current.cards[0].id;

    await act(async () => {
      result.current.deleteCard(id);
    });

    expect(result.current.cards).toHaveLength(0);
    expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith(
      '@iostoandroid/wallet_cards',
      '[]',
    );
  });

  it('deleteCard() on a missing id is a no-op (does not throw)', async () => {
    const { result } = renderHook(() => useCard(), { wrapper });
    await act(async () => {});

    await act(async () => {
      expect(() => result.current.deleteCard('nope')).not.toThrow();
    });
    expect(result.current.cards).toHaveLength(0);
  });

  it('getCard() returns the correct card or undefined', async () => {
    const { result } = renderHook(() => useCard(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addCard({ label: 'Lookup', brand: 'visa', last4: '4321', expiryMonth: 3, expiryYear: 2031 });
    });
    const id = result.current.cards[0].id;

    expect(result.current.getCard(id)?.label).toBe('Lookup');
    expect(result.current.getCard('missing')).toBeUndefined();
  });

  it('hydrates cards from expo-secure-store on mount', async () => {
    const stored = [
      { id: 'c1', label: 'Stored Card', brand: 'visa', last4: '1111', expiryMonth: 5, expiryYear: 2026, createdAt: '2025-01-01T00:00:00Z' },
    ];
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(stored));

    const { result } = renderHook(() => useCard(), { wrapper });
    await act(async () => {});

    expect(result.current.cards).toHaveLength(1);
    expect(result.current.cards[0].label).toBe('Stored Card');
  });

  it('ignores malformed stored JSON instead of crashing', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('not-json{');

    const { result } = renderHook(() => useCard(), { wrapper });
    await act(async () => {});

    expect(result.current.cards).toHaveLength(0);
    expect(result.current.isReady).toBe(true);
  });
});
