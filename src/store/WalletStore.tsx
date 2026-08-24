import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const STORAGE_KEY = '@iostoandroid/wallet_passes';

export type PassType = 'boarding' | 'ticket' | 'loyalty' | 'other';

export interface WalletPass {
  id: string;
  type: PassType;
  title: string;
  subtitle?: string;
  code: string; // free-text value shown/scanned later; not payment data
  color: string;
  createdAt: string;
}

interface WalletContextValue {
  passes: WalletPass[];
  addPass: (pass: Omit<WalletPass, 'id' | 'createdAt'>) => void;
  deletePass: (id: string) => void;
  getPass: (id: string) => WalletPass | undefined;
  isReady: boolean;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [passes, setPasses] = useState<WalletPass[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Load persisted passes (plain, non-sensitive JSON — AsyncStorage is fine;
    // see issue #125: no payment data, so expo-secure-store is deliberately not used).
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setPasses(parsed as WalletPass[]);
          }
        } catch (e) {
          logger.warn('WalletStore', 'failed to parse stored passes', e);
        }
      }
      setIsReady(true);
    }).catch((e) => {
      logger.warn('WalletStore', 'failed to read passes', e);
      setIsReady(true);
    });
  }, []);

  useEffect(() => {
    if (isReady) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(passes));
  }, [passes, isReady]);

  const addPass = useCallback((pass: Omit<WalletPass, 'id' | 'createdAt'>) => {
    setPasses((prev) => [
      ...prev,
      { ...pass, id: Date.now().toString(), createdAt: new Date().toISOString() },
    ]);
  }, []);

  const deletePass = useCallback((id: string) => {
    setPasses((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const getPass = useCallback((id: string) => passes.find((p) => p.id === id), [passes]);

  const value = useMemo(() => ({
    passes, addPass, deletePass, getPass, isReady,
  }), [passes, addPass, deletePass, getPass, isReady]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
