import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@iostoandroid/profile';

export interface Profile {
  name: string;
  email: string;
  bio: string;
  appleId: string;
  icloudStorage: string;
}

const DEFAULT_PROFILE: Profile = {
  name: 'John Appleseed',
  email: 'john.appleseed@icloud.com',
  bio: 'Designer & developer based in Cupertino. Passionate about creating beautiful user interfaces that feel right at home on any platform.',
  appleId: 'john@icloud.com',
  icloudStorage: '50 GB',
};

interface ProfileContextValue {
  profile: Profile;
  updateProfile: (updates: Partial<Profile>) => void;
  reset: () => void;
  isReady: boolean;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        try { setProfile((prev) => ({ ...prev, ...JSON.parse(stored) })); } catch { /* Expected: stored JSON may be corrupted or from an older schema */ }
      }
      setIsReady(true);
    });
  }, []);

  useEffect(() => {
    if (isReady) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile, isReady]);

  const updateProfile = useCallback((updates: Partial<Profile>) => {
    setProfile((prev) => ({ ...prev, ...updates }));
  }, []);

  const reset = useCallback(() => {
    setProfile(DEFAULT_PROFILE);
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(() => ({ profile, updateProfile, reset, isReady }), [profile, updateProfile, reset, isReady]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
