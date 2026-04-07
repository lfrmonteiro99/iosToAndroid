import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@iostoandroid/settings';

export interface SettingsState {
  airplaneMode: boolean;
  wifiEnabled: boolean;
  wifiNetwork: string;
  bluetoothEnabled: boolean;
  bluetoothName: string;
  cellularDataEnabled: boolean;
  hotspotEnabled: boolean;
  hotspotPassword: string;
  notificationsEnabled: boolean;
  notificationSounds: boolean;
  notificationBadges: boolean;
  notificationPreviews: 'always' | 'whenUnlocked' | 'never';
  ringtone: string;
  textTone: string;
  volume: number;
  vibration: boolean;
  keyboardClicks: boolean;
  lockSound: boolean;
  focusMode: 'off' | 'doNotDisturb' | 'sleep' | 'work' | 'personal';
  focusScheduleEnabled: boolean;
  screenTimeEnabled: boolean;
  dailyLimit: number;
  downtime: boolean;
  downtimeStart: string;
  downtimeEnd: string;
  textSizeIndex: number;
  trueTone: boolean;
  autoLock: string;
  raiseToWake: boolean;
  airdrop: 'off' | 'contactsOnly' | 'everyone';
  backgroundAppRefresh: 'off' | 'wifi' | 'wifiAndCellular';
  dateTimeAutomatic: boolean;
  timezone: string;
  use24Hour: boolean;
  keyboardAutoCorrect: boolean;
  keyboardAutoCapitalize: boolean;
  keyboardPredictive: boolean;
  language: string;
  region: string;
  vpnEnabled: boolean;
  lowPowerMode: boolean;
  batteryPercentage: boolean;
  locationServices: boolean;
  analyticsEnabled: boolean;
  personalizedAds: boolean;
  wallpaperIndex: number;
  reduceMotion: boolean;
  boldText: boolean;
}

export const DEFAULT_SETTINGS: SettingsState = {
  airplaneMode: false,
  wifiEnabled: true,
  wifiNetwork: 'Home',
  bluetoothEnabled: true,
  bluetoothName: 'iosToAndroid',
  cellularDataEnabled: true,
  hotspotEnabled: false,
  hotspotPassword: 'password123',
  notificationsEnabled: true,
  notificationSounds: true,
  notificationBadges: true,
  notificationPreviews: 'always',
  ringtone: 'Reflection',
  textTone: 'Note',
  volume: 0.7,
  vibration: true,
  keyboardClicks: true,
  lockSound: true,
  focusMode: 'off',
  focusScheduleEnabled: false,
  screenTimeEnabled: false,
  dailyLimit: 60,
  downtime: false,
  downtimeStart: '22:00',
  downtimeEnd: '07:00',
  textSizeIndex: 1,
  trueTone: true,
  autoLock: '5 Minutes',
  raiseToWake: true,
  airdrop: 'contactsOnly',
  backgroundAppRefresh: 'wifi',
  dateTimeAutomatic: true,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  use24Hour: false,
  keyboardAutoCorrect: true,
  keyboardAutoCapitalize: true,
  keyboardPredictive: true,
  language: 'English',
  region: 'United States',
  vpnEnabled: false,
  lowPowerMode: false,
  batteryPercentage: true,
  locationServices: true,
  analyticsEnabled: false,
  personalizedAds: false,
  wallpaperIndex: 0,
  reduceMotion: false,
  boldText: false,
};

interface SettingsContextValue {
  settings: SettingsState;
  update: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  updateMany: (partial: Partial<SettingsState>) => void;
  reset: () => void;
  isReady: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        try { setSettings((prev) => ({ ...prev, ...JSON.parse(stored) })); } catch { /* ignore */ }
      }
      setIsReady(true);
    });
  }, []);

  useEffect(() => {
    if (isReady) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings, isReady]);

  // Refresh timezone when app comes to foreground (e.g. user changed it in system settings)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        const currentTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        setSettings((prev) => {
          if (prev.timezone !== currentTz) {
            return { ...prev, timezone: currentTz };
          }
          return prev;
        });
      }
    });
    return () => sub.remove();
  }, []);

  const update = useCallback(<K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateMany = useCallback((partial: Partial<SettingsState>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(() => ({ settings, update, updateMany, reset, isReady }), [settings, update, updateMany, reset, isReady]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
