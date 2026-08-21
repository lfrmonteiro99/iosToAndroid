import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { withAutoLockSuppressed } from '../utils/permissions';
import { logger } from '../utils/logger';

export interface LocationPoint {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number; // epoch ms
}

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

interface LocationContextValue {
  currentLocation: LocationPoint | null;
  history: LocationPoint[];
  permissionStatus: PermissionStatus;
  isReady: boolean;
  requestPermission: () => Promise<boolean>;
  refreshLocation: () => Promise<void>;
}

const LOCATION_KEY = '@iostoandroid/findmy_location';
const HISTORY_KEY = '@iostoandroid/findmy_location_history';
const HISTORY_CAP = 50;

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [currentLocation, setCurrentLocation] = useState<LocationPoint | null>(null);
  const [history, setHistory] = useState<LocationPoint[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');
  const [isReady, setIsReady] = useState(false);

  // Hydrate persisted location + history once on mount, and read the live
  // permission state. Everything is gated by `isReady` so callers never see a
  // half-hydrated store.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      AsyncStorage.getItem(LOCATION_KEY),
      AsyncStorage.getItem(HISTORY_KEY),
      Location.getForegroundPermissionsAsync(),
    ]).then(([storedLocation, storedHistory, perm]) => {
      if (cancelled) return;
      if (storedLocation) {
        try {
          setCurrentLocation(JSON.parse(storedLocation) as LocationPoint);
        } catch (e) {
          logger.warn('LocationStore', 'failed to parse stored current location', e);
        }
      }
      if (storedHistory) {
        try {
          const parsed = JSON.parse(storedHistory) as LocationPoint[];
          setHistory(Array.isArray(parsed) ? parsed : []);
        } catch (e) {
          logger.warn('LocationStore', 'failed to parse stored history', e);
        }
      }
      setPermissionStatus(
        perm.status === 'granted' ? 'granted' : perm.status === 'denied' ? 'denied' : 'undetermined',
      );
      setIsReady(true);
    }).catch((e) => {
      if (cancelled) return;
      logger.warn('LocationStore', 'hydration failed', e);
      setIsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isReady) AsyncStorage.setItem(LOCATION_KEY, JSON.stringify(currentLocation));
  }, [currentLocation, isReady]);

  useEffect(() => {
    if (isReady) AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history, isReady]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await withAutoLockSuppressed(() =>
        Location.requestForegroundPermissionsAsync(),
      );
      const mapped: PermissionStatus =
        status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
      setPermissionStatus(mapped);
      return mapped === 'granted';
    } catch (e) {
      logger.warn('LocationStore', 'requestPermission failed', e);
      setPermissionStatus('undetermined');
      return false;
    }
  }, []);

  const refreshLocation = useCallback(async (): Promise<void> => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionStatus('denied');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const point: LocationPoint = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
        timestamp: pos.timestamp,
      };
      setCurrentLocation(point);
      setHistory((prev) => [point, ...prev].slice(0, HISTORY_CAP));
      setPermissionStatus('granted');
    } catch (e) {
      logger.warn('LocationStore', 'refreshLocation failed', e);
      throw e;
    }
  }, []);

  const value = useMemo<LocationContextValue>(
    () => ({
      currentLocation,
      history,
      permissionStatus,
      isReady,
      requestPermission,
      refreshLocation,
    }),
    [currentLocation, history, permissionStatus, isReady, requestPermission, refreshLocation],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within LocationProvider');
  return ctx;
}
