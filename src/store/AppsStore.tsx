import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAlert } from '../components';
import { logger } from '../utils/logger';

const STORAGE_KEY = '@iostoandroid/apps_layout';
const RECENTS_KEY = '@iostoandroid/recent_apps';
const MAX_RECENTS = 8;

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

export interface RecentApp {
  packageName: string;
  launchedAt: number; // epoch ms
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
  recentPackages: string[];
  recentApps: RecentApp[];
  isLoading: boolean;
  refreshApps: () => Promise<void>;
  launchApp: (packageName: string) => Promise<void>;
  addToHome: (packageName: string) => void;
  removeFromHome: (packageName: string) => void;
  addToDock: (packageName: string) => void;
  removeFromDock: (packageName: string) => void;
  removeFromRecents: (packageName: string) => void;
  clearRecents: () => void;
  isDefaultLauncher: boolean;
  openLauncherSettings: () => Promise<void>;
}

const AppsContext = createContext<AppsContextValue | null>(null);

// Virtual built-in apps (our own screens, not real Android packages)
const VIRTUAL_APPS_MAP: Record<string, InstalledApp> = {
  'com.iostoandroid.phone': { name: 'Phone', packageName: 'com.iostoandroid.phone', icon: '', isSystem: false },
  'com.iostoandroid.messages': { name: 'Messages', packageName: 'com.iostoandroid.messages', icon: '', isSystem: false },
  'com.iostoandroid.contacts': { name: 'Contacts', packageName: 'com.iostoandroid.contacts', icon: '', isSystem: false },
  'com.iostoandroid.settings': { name: 'Settings', packageName: 'com.iostoandroid.settings', icon: '', isSystem: false },
  'com.iostoandroid.weather': { name: 'Weather', packageName: 'com.iostoandroid.weather', icon: '', isSystem: false },
  'com.iostoandroid.clock': { name: 'Clock', packageName: 'com.iostoandroid.clock', icon: '', isSystem: false },
  'com.iostoandroid.camera': { name: 'Camera', packageName: 'com.iostoandroid.camera', icon: '', isSystem: false },
  'com.iostoandroid.photos': { name: 'Photos', packageName: 'com.iostoandroid.photos', icon: '', isSystem: false },
  'com.iostoandroid.calendar': { name: 'Calendar', packageName: 'com.iostoandroid.calendar', icon: '', isSystem: false },
  'com.iostoandroid.calculator': { name: 'Calculator', packageName: 'com.iostoandroid.calculator', icon: '', isSystem: false },
};

// Default dock apps — our built-in screens
const DEFAULT_DOCK = [
  'com.iostoandroid.phone',
  'com.iostoandroid.messages',
  'com.iostoandroid.contacts',
  'com.iostoandroid.settings',
];

export function AppsProvider({ children }: { children: React.ReactNode }) {
  const alert = useAlert();
  const alertRef = React.useRef(alert);
  alertRef.current = alert;
  const [state, setState] = useState<AppsState>({
    allApps: [],
    homeApps: [],
    dockApps: DEFAULT_DOCK,
    isLoading: true,
  });
  const [isDefault, setIsDefault] = useState(false);
  const [recentApps, setRecentApps] = useState<RecentApp[]>([]);

  // Load recent apps from storage — supports legacy string[] format
  useEffect(() => {
    AsyncStorage.getItem(RECENTS_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            if (parsed.length > 0 && typeof parsed[0] === 'string') {
              // Legacy format: migrate string[] to RecentApp[]
              const migrated: RecentApp[] = (parsed as string[]).map((pkg, i) => ({
                packageName: pkg,
                launchedAt: Date.now() - i * 60000,
              }));
              setRecentApps(migrated);
              AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(migrated));
            } else {
              setRecentApps(parsed as RecentApp[]);
            }
          }
        } catch (e) { logger.warn('AppsStore', 'failed to parse recent apps', e); }
      }
    });
  }, []);

  const addToRecents = useCallback(async (packageName: string) => {
    setRecentApps(prev => {
      const filtered = prev.filter(p => p.packageName !== packageName);
      const next: RecentApp[] = [{ packageName, launchedAt: Date.now() }, ...filtered].slice(0, MAX_RECENTS);
      AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeFromRecents = useCallback((packageName: string) => {
    setRecentApps(prev => {
      const next = prev.filter(p => p.packageName !== packageName);
      AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearRecents = useCallback(() => {
    setRecentApps([]);
    AsyncStorage.setItem(RECENTS_KEY, JSON.stringify([]));
  }, []);

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
          homeApps = parsed.homeApps || [];
          // Only use saved dock if it contains our virtual apps (otherwise it's stale data)
          const savedDock = parsed.dockApps || [];
          const hasVirtualApps = DEFAULT_DOCK.some((pkg: string) => savedDock.includes(pkg));
          dockApps = hasVirtualApps ? savedDock : DEFAULT_DOCK;
        } catch { /* ignore */ }
      }

      // Ensure our built-in apps are always in the dock
      for (const pkg of DEFAULT_DOCK) {
        if (!dockApps.includes(pkg)) {
          dockApps = [...dockApps.slice(0, 3), pkg]; // keep max 4, ensure built-in present
        }
      }

      // Filter dock apps to only include installed or virtual ones
      dockApps = dockApps.filter((pkg: string) =>
        apps.some((app: InstalledApp) => app.packageName === pkg) || VIRTUAL_APPS_MAP[pkg]
      ).slice(0, 4); // max 4 in dock

      setState({
        allApps: apps,
        homeApps,
        dockApps,
        isLoading: false,
      });
    } catch {
      alertRef.current('Error', 'Could not load apps. Please try again later.');
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
      addToRecents(packageName);
    } catch {
      alertRef.current('Error', 'Could not launch app. Please try again.');
    }
  }, [addToRecents]);

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
    } catch {
      alertRef.current('Error', 'Could not open launcher settings.');
    }
  }, []);

  const dockApps = useMemo(() =>
    state.dockApps
      .map(pkg => state.allApps.find(a => a.packageName === pkg) || VIRTUAL_APPS_MAP[pkg])
      .filter(Boolean) as InstalledApp[],
    [state.dockApps, state.allApps]
  );

  const nonDockApps = useMemo(() =>
    state.allApps.filter(a => !state.dockApps.includes(a.packageName)),
    [state.allApps, state.dockApps]
  );

  // Derive recentPackages (string[]) for backward compatibility
  const recentPackages = useMemo(() => recentApps.map(r => r.packageName), [recentApps]);

  const value = useMemo(() => ({
    apps: state.allApps,
    homeApps: state.homeApps,
    dockApps,
    nonDockApps,
    recentPackages,
    recentApps,
    isLoading: state.isLoading,
    refreshApps: loadApps,
    launchApp,
    addToHome,
    removeFromHome,
    addToDock,
    removeFromDock,
    removeFromRecents,
    clearRecents,
    isDefaultLauncher: isDefault,
    openLauncherSettings,
  }), [state, dockApps, nonDockApps, recentPackages, recentApps, isDefault, loadApps, launchApp, addToHome, removeFromHome, addToDock, removeFromDock, removeFromRecents, clearRecents, openLauncherSettings]);

  return <AppsContext.Provider value={value}>{children}</AppsContext.Provider>;
}

export function useApps() {
  const ctx = useContext(AppsContext);
  if (!ctx) throw new Error('useApps must be used within AppsProvider');
  return ctx;
}
