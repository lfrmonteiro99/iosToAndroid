import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@iostoandroid/contacts';

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  company?: string;
  notes?: string;
  isFavorite: boolean;
  createdAt: string;
}

const SEED_CONTACTS: Contact[] = [];

interface ContactsContextValue {
  contacts: Contact[];
  favorites: Contact[];
  addContact: (contact: Omit<Contact, 'id' | 'createdAt'>) => void;
  updateContact: (id: string, updates: Partial<Contact>) => void;
  deleteContact: (id: string) => void;
  toggleFavorite: (id: string) => void;
  getContact: (id: string) => Contact | undefined;
  reset: () => void;
  isReady: boolean;
}

const ContactsContext = createContext<ContactsContextValue | null>(null);

export function ContactsProvider({ children }: { children: React.ReactNode }) {
  const [contacts, setContacts] = useState<Contact[]>(SEED_CONTACTS);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        try { setContacts(JSON.parse(stored)); } catch { /* ignore */ }
      }
      setIsReady(true);
    });
  }, []);

  useEffect(() => {
    if (isReady) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
  }, [contacts, isReady]);

  const addContact = useCallback((contact: Omit<Contact, 'id' | 'createdAt'>) => {
    setContacts((prev) => [...prev, { ...contact, id: Date.now().toString(), createdAt: new Date().toISOString() }]);
  }, []);

  const updateContact = useCallback((id: string, updates: Partial<Contact>) => {
    setContacts((prev) => prev.map((c) => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const deleteContact = useCallback((id: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setContacts((prev) => prev.map((c) => c.id === id ? { ...c, isFavorite: !c.isFavorite } : c));
  }, []);

  const getContact = useCallback((id: string) => contacts.find((c) => c.id === id), [contacts]);

  const favorites = useMemo(() => contacts.filter((c) => c.isFavorite), [contacts]);

  const reset = useCallback(() => {
    setContacts(SEED_CONTACTS);
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(() => ({
    contacts, favorites, addContact, updateContact, deleteContact, toggleFavorite, getContact, reset, isReady,
  }), [contacts, favorites, addContact, updateContact, deleteContact, toggleFavorite, getContact, reset, isReady]);

  return <ContactsContext.Provider value={value}>{children}</ContactsContext.Provider>;
}

export function useContacts() {
  const ctx = useContext(ContactsContext);
  if (!ctx) throw new Error('useContacts must be used within ContactsProvider');
  return ctx;
}
