import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ContactsProvider, useContacts } from '../ContactsStore';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ContactsProvider>{children}</ContactsProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
});

describe('ContactsStore', () => {
  it('provides seed contacts on mount', async () => {
    const { result } = renderHook(() => useContacts(), { wrapper });
    await act(async () => {});

    expect(result.current.contacts).toHaveLength(26);
    expect(result.current.isReady).toBe(true);
  });

  it('addContact() adds a new contact', async () => {
    const { result } = renderHook(() => useContacts(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.addContact({
        firstName: 'Test',
        lastName: 'User',
        phone: '+1 (555) 999-0000',
        isFavorite: false,
      });
    });

    expect(result.current.contacts).toHaveLength(27);
    const added = result.current.contacts.find((c) => c.firstName === 'Test');
    expect(added).toBeDefined();
    expect(added?.lastName).toBe('User');
    expect(added?.id).toBeTruthy();
    expect(added?.createdAt).toBeTruthy();
  });

  it('updateContact() modifies an existing contact', async () => {
    const { result } = renderHook(() => useContacts(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.updateContact('1', { firstName: 'Alicia' });
    });

    const updated = result.current.contacts.find((c) => c.id === '1');
    expect(updated?.firstName).toBe('Alicia');
    expect(updated?.lastName).toBe('Anderson'); // other fields unchanged
  });

  it('deleteContact() removes a contact', async () => {
    const { result } = renderHook(() => useContacts(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.deleteContact('1');
    });

    expect(result.current.contacts).toHaveLength(25);
    expect(result.current.contacts.find((c) => c.id === '1')).toBeUndefined();
  });

  it('toggleFavorite() toggles isFavorite status', async () => {
    const { result } = renderHook(() => useContacts(), { wrapper });
    await act(async () => {});

    // Alice Anderson (id '1') starts as isFavorite: true
    expect(result.current.contacts.find((c) => c.id === '1')?.isFavorite).toBe(true);

    await act(async () => {
      result.current.toggleFavorite('1');
    });

    expect(result.current.contacts.find((c) => c.id === '1')?.isFavorite).toBe(false);

    // Toggle back
    await act(async () => {
      result.current.toggleFavorite('1');
    });

    expect(result.current.contacts.find((c) => c.id === '1')?.isFavorite).toBe(true);
  });

  it('getContact() returns the correct contact', async () => {
    const { result } = renderHook(() => useContacts(), { wrapper });
    await act(async () => {});

    const contact = result.current.getContact('1');

    expect(contact).toBeDefined();
    expect(contact?.firstName).toBe('Alice');
    expect(contact?.lastName).toBe('Anderson');
  });

  it('getContact() returns undefined for unknown id', async () => {
    const { result } = renderHook(() => useContacts(), { wrapper });
    await act(async () => {});

    expect(result.current.getContact('does-not-exist')).toBeUndefined();
  });

  it('favorites computed correctly matches isFavorite contacts', async () => {
    const { result } = renderHook(() => useContacts(), { wrapper });
    await act(async () => {});

    const favIds = result.current.favorites.map((c) => c.id).sort();
    const expectedIds = result.current.contacts
      .filter((c) => c.isFavorite)
      .map((c) => c.id)
      .sort();

    expect(favIds).toEqual(expectedIds);
    // Sanity: seed data has 7 favorites (ids 1, 3, 7, 10, 13, 20, 26)
    expect(result.current.favorites.length).toBeGreaterThan(0);
  });

  it('favorites list updates after toggleFavorite', async () => {
    const { result } = renderHook(() => useContacts(), { wrapper });
    await act(async () => {});

    const initialFavCount = result.current.favorites.length;

    // Bob Baker (id '2') starts as non-favorite
    await act(async () => {
      result.current.toggleFavorite('2');
    });

    expect(result.current.favorites).toHaveLength(initialFavCount + 1);
    expect(result.current.favorites.find((c) => c.id === '2')).toBeDefined();
  });

  it('reset() restores seed data', async () => {
    const { result } = renderHook(() => useContacts(), { wrapper });
    await act(async () => {});

    // Delete several contacts
    await act(async () => {
      result.current.deleteContact('1');
      result.current.deleteContact('2');
      result.current.deleteContact('3');
    });

    expect(result.current.contacts.length).toBeLessThan(26);

    await act(async () => {
      result.current.reset();
    });

    expect(result.current.contacts).toHaveLength(26);
    expect(result.current.contacts.find((c) => c.id === '1')?.firstName).toBe('Alice');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@iostoandroid/contacts');
  });

  it('persists to AsyncStorage after mutation', async () => {
    const { result } = renderHook(() => useContacts(), { wrapper });
    await act(async () => {});

    (AsyncStorage.setItem as jest.Mock).mockClear();

    await act(async () => {
      result.current.addContact({
        firstName: 'Persist',
        lastName: 'Test',
        phone: '+1 (555) 000-0001',
        isFavorite: false,
      });
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@iostoandroid/contacts',
      expect.stringContaining('Persist'),
    );
  });

  it('hydrates contacts from AsyncStorage on mount', async () => {
    const custom = [
      { id: '99', firstName: 'Stored', lastName: 'Contact', phone: '+1 (555) 000-0099', isFavorite: false, createdAt: '2025-01-01T00:00:00Z' },
    ];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(custom));

    const { result } = renderHook(() => useContacts(), { wrapper });
    await act(async () => {});

    expect(result.current.contacts).toHaveLength(1);
    expect(result.current.contacts[0].firstName).toBe('Stored');
  });
});
