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

const SEED_CONTACTS: Contact[] = [
  { id: '1', firstName: 'Alice', lastName: 'Anderson', phone: '+1 (555) 100-1001', email: 'alice.anderson@gmail.com', company: 'TechCorp', isFavorite: true, createdAt: '2025-03-15T10:00:00Z', notes: '' },
  { id: '2', firstName: 'Bob', lastName: 'Baker', phone: '+1 (555) 100-1002', company: 'Baker & Sons', isFavorite: false, createdAt: '2025-04-02T14:30:00Z', notes: '' },
  { id: '3', firstName: 'Carol', lastName: 'Clark', phone: '+1 (555) 100-1003', email: 'carol.clark@outlook.com', isFavorite: true, createdAt: '2025-01-20T09:15:00Z', notes: 'Met at conference' },
  { id: '4', firstName: 'David', lastName: 'Davis', phone: '+1 (555) 100-1004', company: 'Davis Inc.', isFavorite: false, createdAt: '2025-06-10T16:45:00Z', notes: '' },
  { id: '5', firstName: 'Emma', lastName: 'Evans', phone: '+1 (555) 100-1005', email: 'emma.evans@yahoo.com', isFavorite: false, createdAt: '2025-02-28T11:00:00Z', notes: '' },
  { id: '6', firstName: 'Frank', lastName: 'Fisher', phone: '+1 (555) 100-1006', isFavorite: false, createdAt: '2025-05-15T08:30:00Z', notes: '' },
  { id: '7', firstName: 'Grace', lastName: 'Garcia', phone: '+1 (555) 100-1007', email: 'grace@garcia.net', company: 'Garcia Design', isFavorite: true, createdAt: '2025-07-01T13:20:00Z', notes: '' },
  { id: '8', firstName: 'Henry', lastName: 'Hill', phone: '+1 (555) 100-1008', email: 'henry.hill@proton.me', isFavorite: false, createdAt: '2025-03-22T15:10:00Z', notes: '' },
  { id: '9', firstName: 'Iris', lastName: 'Ingram', phone: '+1 (555) 100-1009', isFavorite: false, createdAt: '2025-08-05T10:45:00Z', notes: '' },
  { id: '10', firstName: 'James', lastName: 'Johnson', phone: '+1 (555) 100-1010', email: 'jjohnson@work.com', company: 'Johnson LLC', isFavorite: true, createdAt: '2025-01-10T09:00:00Z', notes: 'Team lead' },
  { id: '11', firstName: 'Karen', lastName: 'King', phone: '+1 (555) 100-1011', isFavorite: false, createdAt: '2025-09-12T14:00:00Z', notes: '' },
  { id: '12', firstName: 'Leo', lastName: 'Lopez', phone: '+1 (555) 100-1012', email: 'leo@lopez.io', isFavorite: false, createdAt: '2025-04-18T11:30:00Z', notes: '' },
  { id: '13', firstName: 'Maria', lastName: 'Martinez', phone: '+1 (555) 100-1013', email: 'maria.m@gmail.com', company: 'Martinez Studio', isFavorite: true, createdAt: '2025-02-14T16:00:00Z', notes: '' },
  { id: '14', firstName: 'Nathan', lastName: 'Nelson', phone: '+1 (555) 100-1014', isFavorite: false, createdAt: '2025-06-25T08:00:00Z', notes: '' },
  { id: '15', firstName: 'Olivia', lastName: 'Owen', phone: '+1 (555) 100-1015', email: 'olivia.owen@icloud.com', isFavorite: false, createdAt: '2025-07-30T12:15:00Z', notes: '' },
  { id: '16', firstName: 'Paul', lastName: 'Parker', phone: '+1 (555) 100-1016', company: 'Parker & Co', isFavorite: false, createdAt: '2025-05-08T10:00:00Z', notes: '' },
  { id: '17', firstName: 'Quinn', lastName: 'Quinn', phone: '+1 (555) 100-1017', isFavorite: false, createdAt: '2025-08-20T09:30:00Z', notes: '' },
  { id: '18', firstName: 'Rachel', lastName: 'Robinson', phone: '+1 (555) 100-1018', email: 'rachel.r@hotmail.com', isFavorite: false, createdAt: '2025-03-05T15:45:00Z', notes: '' },
  { id: '19', firstName: 'Sam', lastName: 'Smith', phone: '+1 (555) 100-1019', email: 'sam.smith@gmail.com', isFavorite: false, createdAt: '2025-10-01T11:00:00Z', notes: '' },
  { id: '20', firstName: 'Tina', lastName: 'Taylor', phone: '+1 (555) 100-1020', email: 'tina.t@work.com', company: 'Taylor Media', isFavorite: true, createdAt: '2025-01-25T13:00:00Z', notes: '' },
  { id: '21', firstName: 'Uma', lastName: 'Underwood', phone: '+1 (555) 100-1021', isFavorite: false, createdAt: '2025-11-10T10:30:00Z', notes: '' },
  { id: '22', firstName: 'Victor', lastName: 'Vargas', phone: '+1 (555) 100-1022', email: 'victor@vargas.dev', isFavorite: false, createdAt: '2025-04-30T14:20:00Z', notes: '' },
  { id: '23', firstName: 'Wendy', lastName: 'Williams', phone: '+1 (555) 100-1023', email: 'wendy.w@outlook.com', isFavorite: false, createdAt: '2025-06-15T09:00:00Z', notes: '' },
  { id: '24', firstName: 'Xavier', lastName: 'Xu', phone: '+1 (555) 100-1024', company: 'Xu Technologies', isFavorite: false, createdAt: '2025-07-22T16:30:00Z', notes: '' },
  { id: '25', firstName: 'Yuki', lastName: 'Yamamoto', phone: '+1 (555) 100-1025', email: 'yuki@yamamoto.jp', isFavorite: false, createdAt: '2025-09-01T08:45:00Z', notes: '' },
  { id: '26', firstName: 'Zara', lastName: 'Zhang', phone: '+1 (555) 100-1026', email: 'zara.zhang@gmail.com', company: 'Zhang Corp', isFavorite: true, createdAt: '2025-02-20T12:00:00Z', notes: '' },
];

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
