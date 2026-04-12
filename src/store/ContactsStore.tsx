import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@iostoandroid/contacts';
const DEVICE_FAV_KEY = '@iostoandroid/device_favorites';

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
  { id: '1',  firstName: 'Alice',   lastName: 'Anderson', phone: '+1 (555) 100-0001', email: 'alice.anderson@email.com',   company: 'Anderson & Co',    isFavorite: true,  createdAt: '2024-01-01T00:00:00.000Z' },
  { id: '2',  firstName: 'Bob',     lastName: 'Baker',    phone: '+1 (555) 100-0002', email: 'bob.baker@email.com',                                         isFavorite: false, createdAt: '2024-01-02T00:00:00.000Z' },
  { id: '3',  firstName: 'Charlie', lastName: 'Chen',     phone: '+1 (555) 100-0003', email: 'charlie.chen@email.com',    company: 'Chen Consulting',  isFavorite: true,  createdAt: '2024-01-03T00:00:00.000Z' },
  { id: '4',  firstName: 'Diana',   lastName: 'Davis',    phone: '+1 (555) 100-0004',                                                                        isFavorite: false, createdAt: '2024-01-04T00:00:00.000Z' },
  { id: '5',  firstName: 'Edward',  lastName: 'Evans',    phone: '+1 (555) 100-0005', email: 'edward.evans@email.com',                                       isFavorite: false, createdAt: '2024-01-05T00:00:00.000Z' },
  { id: '6',  firstName: 'Fiona',   lastName: 'Foster',   phone: '+1 (555) 100-0006',                                     company: 'Foster Tech',       isFavorite: false, createdAt: '2024-01-06T00:00:00.000Z' },
  { id: '7',  firstName: 'George',  lastName: 'Garcia',   phone: '+1 (555) 100-0007', email: 'george.garcia@email.com',                                      isFavorite: true,  createdAt: '2024-01-07T00:00:00.000Z' },
  { id: '8',  firstName: 'Hannah',  lastName: 'Harris',   phone: '+1 (555) 100-0008', email: 'hannah.harris@email.com',   company: 'Harris Group',      isFavorite: false, createdAt: '2024-01-08T00:00:00.000Z' },
  { id: '9',  firstName: 'Ian',     lastName: 'Ingram',   phone: '+1 (555) 100-0009',                                                                        isFavorite: false, createdAt: '2024-01-09T00:00:00.000Z' },
  { id: '10', firstName: 'Julia',   lastName: 'James',    phone: '+1 (555) 100-0010', email: 'julia.james@email.com',                                        isFavorite: true,  createdAt: '2024-01-10T00:00:00.000Z' },
  { id: '11', firstName: 'Kevin',   lastName: 'King',     phone: '+1 (555) 100-0011',                                     company: 'King Industries',   isFavorite: false, createdAt: '2024-01-11T00:00:00.000Z' },
  { id: '12', firstName: 'Laura',   lastName: 'Lewis',    phone: '+1 (555) 100-0012', email: 'laura.lewis@email.com',                                        isFavorite: false, createdAt: '2024-01-12T00:00:00.000Z' },
  { id: '13', firstName: 'Michael', lastName: 'Moore',    phone: '+1 (555) 100-0013', email: 'michael.moore@email.com',   company: 'Moore Solutions',   isFavorite: true,  createdAt: '2024-01-13T00:00:00.000Z' },
  { id: '14', firstName: 'Nancy',   lastName: 'Nelson',   phone: '+1 (555) 100-0014',                                                                        isFavorite: false, createdAt: '2024-01-14T00:00:00.000Z' },
  { id: '15', firstName: 'Oscar',   lastName: 'Owen',     phone: '+1 (555) 100-0015', email: 'oscar.owen@email.com',                                         isFavorite: false, createdAt: '2024-01-15T00:00:00.000Z' },
  { id: '16', firstName: 'Paula',   lastName: 'Parker',   phone: '+1 (555) 100-0016',                                     company: 'Parker & Parker',   isFavorite: false, createdAt: '2024-01-16T00:00:00.000Z' },
  { id: '17', firstName: 'Quinn',   lastName: 'Quinn',    phone: '+1 (555) 100-0017', email: 'quinn.quinn@email.com',                                        isFavorite: false, createdAt: '2024-01-17T00:00:00.000Z' },
  { id: '18', firstName: 'Rachel',  lastName: 'Roberts',  phone: '+1 (555) 100-0018', email: 'rachel.roberts@email.com',  company: 'Roberts Realty',    isFavorite: false, createdAt: '2024-01-18T00:00:00.000Z' },
  { id: '19', firstName: 'Samuel',  lastName: 'Scott',    phone: '+1 (555) 100-0019',                                                                        isFavorite: false, createdAt: '2024-01-19T00:00:00.000Z' },
  { id: '20', firstName: 'Teresa',  lastName: 'Taylor',   phone: '+1 (555) 100-0020', email: 'teresa.taylor@email.com',                                      isFavorite: true,  createdAt: '2024-01-20T00:00:00.000Z' },
  { id: '21', firstName: 'Ulysses', lastName: 'Upton',    phone: '+1 (555) 100-0021',                                     company: 'Upton Unlimited',   isFavorite: false, createdAt: '2024-01-21T00:00:00.000Z' },
  { id: '22', firstName: 'Vanessa', lastName: 'Vance',    phone: '+1 (555) 100-0022', email: 'vanessa.vance@email.com',                                      isFavorite: false, createdAt: '2024-01-22T00:00:00.000Z' },
  { id: '23', firstName: 'William', lastName: 'Ward',     phone: '+1 (555) 100-0023', email: 'william.ward@email.com',    company: 'Ward & Williams',   isFavorite: false, createdAt: '2024-01-23T00:00:00.000Z' },
  { id: '24', firstName: 'Xena',    lastName: 'Xavier',   phone: '+1 (555) 100-0024',                                                                        isFavorite: false, createdAt: '2024-01-24T00:00:00.000Z' },
  { id: '25', firstName: 'Yvonne',  lastName: 'Young',    phone: '+1 (555) 100-0025', email: 'yvonne.young@email.com',                                       isFavorite: false, createdAt: '2024-01-25T00:00:00.000Z' },
  { id: '26', firstName: 'Zachary', lastName: 'Zhang',    phone: '+1 (555) 100-0026', email: 'zachary.zhang@email.com',   company: 'Zhang Enterprises', isFavorite: true,  createdAt: '2024-01-26T00:00:00.000Z' },
];

interface ContactsContextValue {
  contacts: Contact[];
  favorites: Contact[];
  deviceFavoriteIds: string[];
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
  const [deviceFavoriteIds, setDeviceFavoriteIds] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(DEVICE_FAV_KEY),
    ]).then(([stored, deviceFavs]) => {
      if (stored) {
        try { setContacts(JSON.parse(stored)); } catch (e) { console.warn('ContactsStore: failed to parse stored contacts:', e); }
      }
      if (deviceFavs) {
        try { setDeviceFavoriteIds(JSON.parse(deviceFavs)); } catch { /* ignore */ }
      }
      setIsReady(true);
    });
  }, []);

  useEffect(() => {
    if (isReady) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
  }, [contacts, isReady]);

  useEffect(() => {
    if (isReady) AsyncStorage.setItem(DEVICE_FAV_KEY, JSON.stringify(deviceFavoriteIds));
  }, [deviceFavoriteIds, isReady]);

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
    setContacts((prev) => {
      const inStore = prev.some(c => c.id === id);
      if (inStore) {
        return prev.map((c) => c.id === id ? { ...c, isFavorite: !c.isFavorite } : c);
      }
      // Device contact not in store — toggle in deviceFavoriteIds
      setDeviceFavoriteIds(ids =>
        ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
      );
      return prev;
    });
  }, []);

  // Clean up orphaned device favorite IDs (IDs that don't match any contact)
  useEffect(() => {
    if (!isReady || deviceFavoriteIds.length === 0) return;
    const contactIds = new Set(contacts.map(c => c.id));
    const valid = deviceFavoriteIds.filter(id => contactIds.has(id));
    if (valid.length !== deviceFavoriteIds.length) {
      setDeviceFavoriteIds(valid);
    }
  }, [isReady, contacts]); // eslint-disable-line react-hooks/exhaustive-deps

  const getContact = useCallback((id: string) => contacts.find((c) => c.id === id), [contacts]);

  const favorites = useMemo(() => contacts.filter((c) => c.isFavorite), [contacts]);

  const reset = useCallback(() => {
    setContacts(SEED_CONTACTS);
    setDeviceFavoriteIds([]);
    AsyncStorage.removeItem(STORAGE_KEY);
    AsyncStorage.removeItem(DEVICE_FAV_KEY);
  }, []);

  const value = useMemo(() => ({
    contacts, favorites, deviceFavoriteIds, addContact, updateContact, deleteContact, toggleFavorite, getContact, reset, isReady,
  }), [contacts, favorites, deviceFavoriteIds, addContact, updateContact, deleteContact, toggleFavorite, getContact, reset, isReady]);

  return <ContactsContext.Provider value={value}>{children}</ContactsContext.Provider>;
}

export function useContacts() {
  const ctx = useContext(ContactsContext);
  if (!ctx) throw new Error('useContacts must be used within ContactsProvider');
  return ctx;
}
