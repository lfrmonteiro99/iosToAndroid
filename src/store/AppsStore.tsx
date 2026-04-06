import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@iostoandroid/apps_layout';

export interface InstalledApp {
  name: string;
  packageName: string;
  icon: string;
  isSystem: boolean;
}

export interface HomeApp {
  packageName: string;
  position: number;
}

interface AppsState {
  allApps: InstalledApp[];
  homeApps: HomeApp[];
  dockApps: string[]; // package names for bottom dock (max 4)
  isLoading: boolean;
}

interface AppsContextValue {
  apps: InstalledApp[];
  homeApps: HomeApp[];
  dockApps: InstalledApp[];
  nonDockApps: InstalledApp[];
  isLoading: boolean;
  refreshApps: () => Promise<void>;
  launchApp: (packageName: string) => Promise<void>;
  addToHome: (packageName: string) => void;
  removeFromHome: (packageName: string) => void;
  addToDock: (packageName: string) => void;
  removeFromDock: (packageName: string) => void;
  isDefaultLauncher: boolean;
  openLauncherSettings: () => Promise<void>;
}

const AppsContext = createContext<AppsContextValue | null>(null);

// Default dock apps (common Android package names)
const DEFAULT_DOCK = [
  'com.android.dialer',
  'com.android.mms',
  'com.android.chrome',
  'com.android.camera2',
];

export function AppsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppsState>({
    allApps: [],
    homeApps: [],
    dockApps: DEFAULT_DOCK,
    isLoading: true,
  });
  const [isDefault, setIsDefault] = useState(false);

  const loadApps = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      // Dynamic import to avoid crash on non-Android
      const LauncherModule = (await import('../../modules/launcher-module/src')).default;

      const [apps, savedLayout, defaultStatus] = await Promise.all([
        LauncherModule.getInstalledApps(),
        AsyncStorage.getItem(STORAGE_KEY),
        LauncherModule.isDefaultLauncher(),
      ]);

      setIsDefault(defaultStatus);

      let dockApps = DEFAULT_DOCK;
      let homeApps: HomeApp[] = [];

      if (savedLayout) {
        try {
          const parsed = JSON.parse(savedLayout);
          dockApps = parsed.dockApps || DEFAULT_DOCK;
          homeApps = parsed.homeApps || [];
        } catch { /* ignore */ }
      }

      // Filter dock apps to only include installed ones
      dockApps = dockApps.filter((pkg: string) =>
        apps.some((app: InstalledApp) => app.packageName === pkg)
      );

      setState({
        allApps: apps,
        homeApps,
        dockApps,
        isLoading: false,
      });
    } catch (e) {
      console.warn('Failed to load apps:', e);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const persist = useCallback((dockApps: string[], homeApps: HomeApp[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ dockApps, homeApps }));
  }, []);

  const launchApp = useCallback(async (packageName: string) => {
    if (Platform.OS !== 'android') return;
    try {
      const LauncherModule = (await import('../../modules/launcher-module/src')).default;
      await LauncherModule.launchApp(packageName);
    } catch (e) {
      console.warn('Failed to launch app:', e);
    }
  }, []);

  const addToHome = useCallback((packageName: string) => {
    setState(prev => {
      const exists = prev.homeApps.some(a => a.packageName === packageName);
      if (exists) return prev;
      const maxPos = prev.homeApps.reduce((max, a) => Math.max(max, a.position), -1);
      const homeApps = [...prev.homeApps, { packageName, position: maxPos + 1 }];
      persist(prev.dockApps, homeApps);
      return { ...prev, homeApps };
    });
  }, [persist]);

  const removeFromHome = useCallback((packageName: string) => {
    setState(prev => {
      const homeApps = prev.homeApps.filter(a => a.packageName !== packageName);
      persist(prev.dockApps, homeApps);
      return { ...prev, homeApps };
    });
  }, [persist]);

  const addToDock = useCallback((packageName: string) => {
    setState(prev => {
      if (prev.dockApps.length >= 4 || prev.dockApps.includes(packageName)) return prev;
      const dockApps = [...prev.dockApps, packageName];
      persist(dockApps, prev.homeApps);
      return { ...prev, dockApps };
    });
  }, [persist]);

  const removeFromDock = useCallback((packageName: string) => {
    setState(prev => {
      const dockApps = prev.dockApps.filter(p => p !== packageName);
      persist(dockApps, prev.homeApps);
      return { ...prev, dockApps };
    });
  }, [persist]);

  const openLauncherSettings = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      const LauncherModule = (await import('../../modules/launcher-module/src')).default;
      await LauncherModule.openLauncherSettings();
    } catch (e) {
      console.warn('Failed to open launcher settings:', e);
    }
  }, []);

  const dockApps = useMemo(() =>
    state.dockApps
      .map(pkg => state.allApps.find(a => a.packageName === pkg))
      .filter(Boolean) as InstalledApp[],
    [state.dockApps, state.allApps]
  );

  const nonDockApps = useMemo(() =>
    state.allApps.filter(a => !state.dockApps.includes(a.packageName)),
    [state.allApps, state.dockApps]
  );

  const value = useMemo(() => ({
    apps: state.allApps,
    homeApps: state.homeApps,
    dockApps,
    nonDockApps,
    isLoading: state.isLoading,
    refreshApps: loadApps,
    launchApp,
    addToHome,
    removeFromHome,
    addToDock,
    removeFromDock,
    isDefaultLauncher: isDefault,
    openLauncherSettings,
  }), [state, dockApps, nonDockApps, isDefault, loadApps, launchApp, addToHome, removeFromHome, addToDock, removeFromDock, openLauncherSettings]);

  return <AppsContext.Provider value={value}>{children}</AppsContext.Provider>;
}

export function useApps() {
  const ctx = useContext(AppsContext);
  if (!ctx) throw new Error('useApps must be used within AppsProvider');
  return ctx;
}
