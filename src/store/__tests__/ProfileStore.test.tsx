import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProfileProvider, useProfile } from '../ProfileStore';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ProfileProvider>{children}</ProfileProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
});

describe('ProfileStore', () => {
  it('provides default profile on mount', async () => {
    const { result } = renderHook(() => useProfile(), { wrapper });
    await act(async () => {});

    expect(result.current.profile.name).toBe('John Appleseed');
    expect(result.current.profile.email).toBe('john.appleseed@gmail.com');
    expect(result.current.profile.avatarUri).toBeNull();
    expect(result.current.isReady).toBe(true);
  });

  it('updateProfile() changes profile fields', async () => {
    const { result } = renderHook(() => useProfile(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.updateProfile({ name: 'Jane Appleseed' });
    });

    expect(result.current.profile.name).toBe('Jane Appleseed');
    // Other fields remain intact
    expect(result.current.profile.email).toBe('john.appleseed@gmail.com');
  });

  it('updateProfile() can update multiple fields at once', async () => {
    const { result } = renderHook(() => useProfile(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.updateProfile({ name: 'Bob', email: 'bob@example.com' });
    });

    expect(result.current.profile.name).toBe('Bob');
    expect(result.current.profile.email).toBe('bob@example.com');
  });

  it('reset() restores defaults', async () => {
    const { result } = renderHook(() => useProfile(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.updateProfile({ name: 'Changed Name', email: 'changed@example.com' });
    });

    expect(result.current.profile.name).toBe('Changed Name');

    await act(async () => {
      result.current.reset();
    });

    expect(result.current.profile.name).toBe('John Appleseed');
    expect(result.current.profile.email).toBe('john.appleseed@gmail.com');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@iostoandroid/profile');
  });

  it('persists to AsyncStorage on update', async () => {
    const { result } = renderHook(() => useProfile(), { wrapper });
    await act(async () => {});

    (AsyncStorage.setItem as jest.Mock).mockClear();

    await act(async () => {
      result.current.updateProfile({ name: 'Persisted Name' });
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@iostoandroid/profile',
      expect.stringContaining('Persisted Name'),
    );
  });

  it('hydrates from AsyncStorage on mount', async () => {
    const saved = JSON.stringify({
      name: 'Stored User',
      email: 'stored@example.com',
      bio: 'Stored bio',
      avatarUri: null,
    });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(saved);

    const { result } = renderHook(() => useProfile(), { wrapper });
    await act(async () => {});

    expect(result.current.profile.name).toBe('Stored User');
    expect(result.current.profile.email).toBe('stored@example.com');
    expect(result.current.isReady).toBe(true);
  });

  it('falls back to defaults when AsyncStorage returns a non-object JSON value', async () => {
    // A JSON string is valid JSON but cannot be spread into the profile object,
    // so the store catch block fires and defaults remain.
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('"just-a-string"');

    const { result } = renderHook(() => useProfile(), { wrapper });
    await act(async () => {});

    expect(result.current.profile.name).toBe('John Appleseed');
    expect(result.current.isReady).toBe(true);
  });
});
