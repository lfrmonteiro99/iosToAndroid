import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { logger } from '../utils/logger';

const STORAGE_KEY = '@iostoandroid/wallet_cards';

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'other';

// No `cardNumber`, no `pan`, no `cvv` field exists on this type or is ever
// passed to SecureStore — see CardEditScreen, where the full number/CVV live
// only in local component state for the duration of the form (issue #285).
export interface WalletCard {
  id: string;
  label: string;
  brand: CardBrand;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  createdAt: string;
}

interface CardContextValue {
  cards: WalletCard[];
  addCard: (card: Omit<WalletCard, 'id' | 'createdAt'>) => void;
  deleteCard: (id: string) => void;
  getCard: (id: string) => WalletCard | undefined;
  isReady: boolean;
}

const CardContext = createContext<CardContextValue | null>(null);

export function CardProvider({ children }: { children: React.ReactNode }) {
  const [cards, setCards] = useState<WalletCard[]>([]);
  const [isReady, setIsReady] = useState(false);
  // Skip the write-back triggered by the ready-flip itself — at that point
  // `cards` is exactly what was just hydrated, so persisting it again is a
  // no-op that only costs an extra SecureStore call (and, worse, one that
  // other screens' tests can observe as an unexpected write). Real writes
  // start with the first addCard/deleteCard after hydration.
  const skipNextPersist = useRef(true);

  useEffect(() => {
    // Payment card data — always expo-secure-store, never AsyncStorage
    // (contrast with WalletStore's passes, which are plain non-sensitive JSON).
    SecureStore.getItemAsync(STORAGE_KEY).then((stored) => {
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setCards(parsed as WalletCard[]);
          }
        } catch (e) {
          logger.warn('CardStore', 'failed to parse stored cards', e);
        }
      }
      setIsReady(true);
    }).catch((e) => {
      logger.warn('CardStore', 'failed to read cards', e);
      setIsReady(true);
    });
  }, []);

  useEffect(() => {
    if (!isReady) return;
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      // Nothing was added/removed yet — an empty array here is exactly what
      // was just hydrated (or the untouched initial state), so writing it
      // back is a no-op. Once a real card exists, do NOT skip: addCard()
      // can resolve before hydration finishes, and that write must land.
      if (cards.length === 0) return;
    }
    SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(cards)).catch((e) => {
      logger.warn('CardStore', 'failed to persist cards', e);
    });
  }, [cards, isReady]);

  const addCard = useCallback((card: Omit<WalletCard, 'id' | 'createdAt'>) => {
    setCards((prev) => [
      ...prev,
      { ...card, id: Date.now().toString(), createdAt: new Date().toISOString() },
    ]);
  }, []);

  const deleteCard = useCallback((id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const getCard = useCallback((id: string) => cards.find((c) => c.id === id), [cards]);

  const value = useMemo(() => ({
    cards, addCard, deleteCard, getCard, isReady,
  }), [cards, addCard, deleteCard, getCard, isReady]);

  return <CardContext.Provider value={value}>{children}</CardContext.Provider>;
}

export function useCard() {
  const ctx = useContext(CardContext);
  if (!ctx) throw new Error('useCard must be used within CardProvider');
  return ctx;
}
