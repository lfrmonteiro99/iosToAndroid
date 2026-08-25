import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAlert } from '../components';
import { logger } from '../utils/logger';
import { migrateAsyncStorageKey } from './storage';
import { upsertApp, removeApp } from './appsIndexReducer';
import { getIconMask, subscribeIconMask, type IconMaskOptions } from '../utils/iconShape';
import { authenticateWithBiometrics } from '../utils/biometricAuth';
import { dispatchLaunchApp } from '../actions/primitiveDispatcher';
import type { PackageChange } from '../../modules/launcher-module/src';

const STORAGE_KEY = '@iostoandroid/apps_layout';
const LIBRARY_ONLY_KEY = '@iostoandroid/library_only';
const HIDDEN_APPS_KEY = '@iostoandroid/hidden_apps';
const PROTECTED_APPS_KEY = '@iostoandroid/protected_apps';
const APPS_INDEX_KEY = '@iostoandroid/apps_index';
const RECENTS_KEY = '@iostoandroid/recent_apps';
const RECENTS_LEGACY_KEY = '@recent_apps';
const MAX_RECENTS = 8;

export interface InstalledApp {
  name: string;
  packageName: string;
  icon: string;
  isSystem: boolean;
  /**
   * ApplicationInfo.category exposed by LauncherModule (see modules/launcher-module).
   * Optional: absent on cached indexes written before this field existed, and
   * on the virtual built-in apps in VIRTUAL_APPS_MAP below.
   */
  category?: string;
}

export interface HomeApp {
  packageName: string;
  position: number;
}

export interface RecentApp {
  packageName: string;
  launchedAt: number; // epoch ms
}

/**
 * Normaliza o blob persistido de apps recentes (@iostoandroid/recent_apps).
 *
 * O blob era aceite desde que fosse um array, sem validar as ENTRADAS. Uma
 * entrada corrompida (`null`, string, objecto sem `packageName`/`launchedAt`,
 * array aninhado) chegava intacta aos consumidores, e a App Library — que é a
 * última página do pager da home — faz `r.packageName` e ordena por
 * `b.launchedAt - a.launchedAt` no render: uma entrada `null` rebentava com
 * TypeError e o throw derrubava o launcher inteiro, mostrando o ecrã inicial do
 * Android (#689). Como o blob é persistido, o crash repetia-se em cada arranque.
 *
 * Regras: só objectos com `packageName` string não-vazia e `launchedAt` numérico
 * finito sobrevivem; o resto é descartado silenciosamente (é lixo de uma build
 * anterior, não informação recuperável). Duplicados por packageName são
 * colapsados na primeira ocorrência, como faz `addToRecents`.
 */
export function normalizeRecentApps(raw: unknown): RecentApp[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: RecentApp[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const { packageName, launchedAt } = entry as { packageName?: unknown; launchedAt?: unknown };
    if (typeof packageName !== 'string' || packageName === '') continue;
    if (typeof launchedAt !== 'number' || !Number.isFinite(launchedAt)) continue;
    if (seen.has(packageName)) continue;
    seen.add(packageName);
    out.push({ packageName, launchedAt });
  }
  return out.slice(0, MAX_RECENTS);
}

/**
 * Garante que toda app em `apps` tem uma entrada em `homeApps` (#760).
 *
 * `homeApps` é a fonte de verdade da ordem/pertença na grelha (lida por
 * LauncherHomeScreen), mas até este fix só era escrita por addToHome/
 * removeFromHome — nunca por loadApps nem pelo listener de instalação — pelo
 * que apps carregadas pelo scan nativo nunca tinham `position`. Qualquer app
 * em falta recebe a próxima posição livre (`maxPos + 1`), na ordem em que
 * aparece em `apps`: numa instalação limpa isso reproduz a ordem de scan
 * actual (sem regressão visual); múltiplas apps em falta na mesma chamada
 * recebem posições sequenciais sem colidir, porque o `maxPos` de referência é
 * calculado uma única vez, antes do loop. Entradas já existentes em
 * `homeApps` não são tocadas. Devolve a mesma referência quando não há nada a
 * acrescentar, para não invalidar memoização a jusante.
 */
export function assignHomePositions(homeApps: HomeApp[], apps: InstalledApp[]): HomeApp[] {
  const known = new Set(homeApps.map(h => h.packageName));
  const missing = apps.filter(a => !known.has(a.packageName));
  if (missing.length === 0) return homeApps;
  let nextPosition = homeApps.reduce((max, h) => Math.max(max, h.position), -1) + 1;
  const additions: HomeApp[] = missing.map(a => ({ packageName: a.packageName, position: nextPosition++ }));
  return [...homeApps, ...additions];
}

/**
 * Swaps the `position` of two homeApps entries (#761 — jiggle-mode drag to
 * reorder). This is the classic iOS behaviour: dropping icon A onto icon B's
 * cell trades their positions, it does not shift everything in between (that
 * shift, and dropping on an EMPTY cell, is the next sub-issue's scope — #761
 * explicitly excludes it).
 *
 * Returns the same array reference when there is nothing to do (same
 * package, or either package has no recorded position — dragging something
 * not yet in homeApps shouldn't happen via the grid, but failing closed here
 * means a stray call is a no-op instead of corrupting positions), so a no-op
 * swap does not trigger an extra persist()/re-render.
 */
export function swapHomePositions(homeApps: HomeApp[], packageA: string, packageB: string): HomeApp[] {
  if (packageA === packageB) return homeApps;
  const idxA = homeApps.findIndex(h => h.packageName === packageA);
  const idxB = homeApps.findIndex(h => h.packageName === packageB);
  if (idxA === -1 || idxB === -1) return homeApps;
  const posA = homeApps[idxA].position;
  const posB = homeApps[idxB].position;
  if (posA === posB) return homeApps;
  const next = [...homeApps];
  next[idxA] = { ...next[idxA], position: posB };
  next[idxB] = { ...next[idxB], position: posA };
  return next;
}

// Dynamic import to avoid crashing the module on non-Android. Falls back to a
// synchronous require when dynamic import() is unavailable (e.g. Jest's VM
// without --experimental-vm-modules) so moduleNameMapper mocks still apply in tests.
async function getLauncherModule() {
  try {
    return (await import('../../modules/launcher-module/src')).default;
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro supports require; fallback for environments without dynamic import
      return require('../../modules/launcher-module/src').default;
    } catch {
      return null;
    }
  }
}

// The module's named exports (the event-subscription helpers), loaded the same
// defensive way as the default export above.
async function getLauncherModuleExports(): Promise<
  typeof import('../../modules/launcher-module/src') | null
> {
  try {
    return await import('../../modules/launcher-module/src');
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro supports require; fallback for environments without dynamic import
      return require('../../modules/launcher-module/src');
    } catch {
      return null;
    }
  }
}

interface AppsState {
  allApps: InstalledApp[];
  homeApps: HomeApp[];
  dockApps: string[]; // package names for bottom dock (max 4)
  isLoading: boolean;
  /**
   * Packages the user (or the "App Library Only" default) has asked to keep off
   * the home screen. Apps here still appear in the App Library. Seeded at
   * install time when settings.newAppsToHome is false (#601) and grown by the
   * home-grid long-press "Remove from Home" path — removeFromHome() is kept as
   * the user-facing equivalent so behaviour is unified.
   */
  libraryOnlyApps: string[];
  /**
   * Packages hidden from the home screen AND from every browsable list in the
   * App Library (#606 — the iOS "hide app" behaviour). The app stays installed
   * and launchable through search, unlike libraryOnlyApps which only keeps it
   * off the home grid. The two sets are independent on purpose: unhiding must
   * not silently undo a "Remove from Home".
   */
  hiddenApps: string[];
  /**
   * Packages that require a successful biometric authentication (#627 —
   * "Protected Apps") before launchApp() actually starts them. Independent of
   * hiddenApps: a protected app can still be visible everywhere, it just gates
   * on open.
   */
  protectedApps: string[];
}

export interface IconCacheRebuildProgress {
  done: number;
  total: number;
}

interface AppsContextValue {
  apps: InstalledApp[];
  homeApps: HomeApp[];
  dockApps: InstalledApp[];
  nonDockApps: InstalledApp[];
  /**
   * Packages kept off the home screen (#601); they still appear in the App
   * Library. Optional on the context value only so older test mocks that cast a
   * hand-built object to AppsContextValue keep type-checking — the real provider
   * always populates it.
   */
  libraryOnlyApps?: string[];
  /**
   * Packages hidden via hideApp() (#606). Excluded from nonDockApps and from
   * visibleApps, but still present in `apps` so search can launch them.
   */
  hiddenApps: string[];
  /**
   * Packages gated behind biometric authentication on launch (#627 —
   * "Protected Apps"). See launchApp(). Optional on the context value for the
   * same reason as libraryOnlyApps above — older hand-built test mocks cast to
   * AppsContextValue without it; the real provider always populates it.
   */
  protectedApps?: string[];
  /**
   * `apps` minus the hidden packages — what the App Library shows in its
   * categories and Recently Added / Suggestions strips. Search deliberately
   * keeps reading `apps` so a hidden app remains launchable.
   */
  visibleApps: InstalledApp[];
  recentPackages: string[];
  recentApps: RecentApp[];
  isLoading: boolean;
  refreshApps: () => Promise<void>;
  // Promise<boolean> e nao Promise<void>: o #509 precisa de saber se o lancamento
  // correu para decidir se anima a expansao do icone. O lado do main ainda tinha
  // a assinatura antiga.
  launchApp: (packageName: string) => Promise<boolean>;
  addToHome: (packageName: string) => void;
  removeFromHome: (packageName: string) => void;
  /**
   * Swaps two homeApps entries' positions (#761 — jiggle-mode drag to
   * reorder). Optional on the context value for the same reason as
   * protectApp above: older hand-built test mocks cast to AppsContextValue
   * without it keep type-checking; the real provider always populates it.
   */
  swapHomeApps?: (packageA: string, packageB: string) => void;
  /**
   * Reassigns every homeApps[].position sequentially (0, 1, 2, ...) in their
   * current relative order, removing any holes left by removeFromHome or by
   * dropping an icon on an empty cell (#762). No app is dropped — only
   * positions shift.
   */
  compactHomeLayout: () => void;
  /** Hide the package from the home screen and the App Library's browsable lists (#606). */
  hideApp: (packageName: string) => void;
  /** Undo hideApp() for the package (#606). */
  unhideApp: (packageName: string) => void;
  /**
   * Gate the package behind biometric authentication on launch (#627).
   * Optional on the context value for the same reason as protectedApps above.
   */
  protectApp?: (packageName: string) => void;
  /** Undo protectApp() for the package (#627). Optional, same reason. */
  unprotectApp?: (packageName: string) => void;
  addToDock: (packageName: string) => void;
  removeFromDock: (packageName: string) => void;
  removeFromRecents: (packageName: string) => void;
  clearRecents: () => void;
  isDefaultLauncher: boolean;
  openLauncherSettings: () => Promise<void>;
  /** Total size, in bytes, of the on-disk icon cache (filesDir/icons). */
  iconCacheSizeBytes: number;
  /** True while rebuildIconCache() is deleting and redrawing icons. */
  isRebuildingIconCache: boolean;
  /** Non-null only while a rebuild is in flight. */
  iconCacheRebuildProgress: IconCacheRebuildProgress | null;
  /**
   * Manual escape hatch (#486) for when the versionCode/treatment cache key
   * doesn't invalidate a stale icon on its own: deletes every cached PNG, then
   * redraws one icon at a time (each a separate await, so the UI thread is
   * never blocked) reporting progress via iconCacheRebuildProgress.
   */
  rebuildIconCache: () => Promise<void>;
}

const AppsContext = createContext<AppsContextValue | null>(null);

// Virtual built-in apps (our own screens, not real Android packages)
const VIRTUAL_APPS_MAP: Record<string, InstalledApp> = {
  'com.iostoandroid.phone': { name: 'Phone', packageName: 'com.iostoandroid.phone', icon: '', isSystem: false },
  'com.iostoandroid.messages': { name: 'Messages', packageName: 'com.iostoandroid.messages', icon: '', isSystem: false },
  'com.iostoandroid.contacts': { name: 'Contacts', packageName: 'com.iostoandroid.contacts', icon: '', isSystem: false },
  'com.iostoandroid.settings': { name: 'Settings', packageName: 'com.iostoandroid.settings', icon: '', isSystem: false },
  'com.iostoandroid.weather': { name: 'Weather', packageName: 'com.iostoandroid.weather', icon: '', isSystem: false },
  'com.iostoandroid.health': { name: 'Health', packageName: 'com.iostoandroid.health', icon: '', isSystem: false },
  'com.iostoandroid.clock': { name: 'Clock', packageName: 'com.iostoandroid.clock', icon: '', isSystem: false },
  'com.iostoandroid.camera': { name: 'Camera', packageName: 'com.iostoandroid.camera', icon: '', isSystem: false },
  'com.iostoandroid.photos': { name: 'Photos', packageName: 'com.iostoandroid.photos', icon: '', isSystem: false },
  'com.iostoandroid.calendar': { name: 'Calendar', packageName: 'com.iostoandroid.calendar', icon: '', isSystem: false },
  'com.iostoandroid.calculator': { name: 'Calculator', packageName: 'com.iostoandroid.calculator', icon: '', isSystem: false },
  'com.iostoandroid.notes': { name: 'Notes', packageName: 'com.iostoandroid.notes', icon: '', isSystem: false },
  'com.iostoandroid.reminders': { name: 'Reminders', packageName: 'com.iostoandroid.reminders', icon: '', isSystem: false },
  'com.iostoandroid.mail': { name: 'Mail', packageName: 'com.iostoandroid.mail', icon: '', isSystem: false },
  'com.iostoandroid.wallet': { name: 'Wallet', packageName: 'com.iostoandroid.wallet', icon: '', isSystem: false },
  // Safari and Shortcuts were in BUILT_IN_APPS (so the grid drew them) but
  // missing here, which is the set used to keep our own fake packages out of
  // "real installed apps" views like the App Store's Updates list. Maps, Find
  // My and App Store are newly surfaced on the grid and need both.
  'com.iostoandroid.browser': { name: 'Safari', packageName: 'com.iostoandroid.browser', icon: '', isSystem: false },
  'com.iostoandroid.shortcuts': { name: 'Shortcuts', packageName: 'com.iostoandroid.shortcuts', icon: '', isSystem: false },
  'com.iostoandroid.maps': { name: 'Maps', packageName: 'com.iostoandroid.maps', icon: '', isSystem: false },
  'com.iostoandroid.findmy': { name: 'Find My', packageName: 'com.iostoandroid.findmy', icon: '', isSystem: false },
  'com.iostoandroid.appstore': { name: 'App Store', packageName: 'com.iostoandroid.appstore', icon: '', isSystem: false },
  // iOS facades over installed Android apps (utils/iosFacadeApps.ts). Listed
  // here for the same reason as the built-ins: these package names are ours,
  // not real installed packages, so views of "real apps" must exclude them.
  'com.iostoandroid.music': { name: 'Music', packageName: 'com.iostoandroid.music', icon: '', isSystem: false },
  'com.iostoandroid.news': { name: 'News', packageName: 'com.iostoandroid.news', icon: '', isSystem: false },
  'com.iostoandroid.tv': { name: 'TV', packageName: 'com.iostoandroid.tv', icon: '', isSystem: false },
  'com.iostoandroid.podcasts': { name: 'Podcasts', packageName: 'com.iostoandroid.podcasts', icon: '', isSystem: false },
};

// Single source of truth for this app's own virtual built-ins. Every entry in
// VIRTUAL_APPS_MAP has isSystem:false, so screens must exclude them by package
// name, never by isSystem — otherwise the App Store's Updates list (and any
// other "real installed apps" view) would surface our own fake packages.
export const VIRTUAL_APP_PACKAGE_NAMES: ReadonlySet<string> = new Set(
  Object.keys(VIRTUAL_APPS_MAP),
);

// Default dock apps — our built-in screens
const DEFAULT_DOCK = [
  'com.iostoandroid.phone',
  'com.iostoandroid.messages',
  'com.iostoandroid.contacts',
  'com.iostoandroid.settings',
];

/** Mirrors SettingsState['iconTreatment']'s default (SettingsStore.tsx) and the
 * native side's IconTreatment.DEFAULT — used when no setting has loaded yet. */
const DEFAULT_ICON_TREATMENT = 'mask-adaptive-only';

export function AppsProvider({
  children,
  iconTreatment = DEFAULT_ICON_TREATMENT,
  newAppsToHome = true,
}: {
  children: React.ReactNode;
  /**
   * Passed down from SettingsStore by the app shell (see App.tsx) rather than
   * read here via useSettings(), so AppsProvider stays usable on its own —
   * every existing AppsStore test mounts it without a SettingsProvider above.
   */
  iconTreatment?: string;
  /**
   * Whether freshly installed apps go to the home screen (#601). Passed down
   * from SettingsStore by the app shell (see App.tsx) so AppsProvider stays
   * usable on its own — every existing AppsStore test mounts it without a
   * SettingsProvider above, and defaults to true (the current behaviour).
   */
  newAppsToHome?: boolean;
}) {
  const alert = useAlert();
  const alertRef = React.useRef(alert);
  alertRef.current = alert;
  // Read inside launchApp without adding state.protectedApps as a dependency
  // (same reasoning as alertRef above): keeps launchApp's identity stable
  // across every protect/unprotect toggle instead of recreating it.
  const protectedAppsRef = React.useRef<string[]>([]);
  const [state, setState] = useState<AppsState>({
    allApps: [],
    homeApps: [],
    dockApps: DEFAULT_DOCK,
    isLoading: true,
    libraryOnlyApps: [],
    hiddenApps: [],
    protectedApps: [],
  });
  protectedAppsRef.current = state.protectedApps;
  const [isDefault, setIsDefault] = useState(false);
  const [recentApps, setRecentApps] = useState<RecentApp[]>([]);
  const [iconCacheSizeBytes, setIconCacheSizeBytes] = useState(0);
  const [isRebuildingIconCache, setIsRebuildingIconCache] = useState(false);
  const [iconCacheRebuildProgress, setIconCacheRebuildProgress] = useState<IconCacheRebuildProgress | null>(null);
  // A ref, not just the isRebuildingIconCache state, guards re-entrancy: two
  // rebuildIconCache() calls in the same synchronous tick (double-tap on the
  // button) both close over the state value from the last render, so a
  // state-only guard would let both through. The ref is set synchronously on
  // the very first line, before the async work starts.
  const isRebuildingRef = React.useRef(false);

  // Load recent apps from storage — supports legacy string[] format
  useEffect(() => {
    (async () => {
      await migrateAsyncStorageKey(RECENTS_LEGACY_KEY, RECENTS_KEY);
      const raw = await AsyncStorage.getItem(RECENTS_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            if (parsed.length > 0 && typeof parsed[0] === 'string') {
              // Legacy format: migrate string[] to RecentApp[]. Só as entradas
              // que são de facto strings não-vazias — um array misto
              // (legacy parcialmente reescrito) produzia `packageName:
              // undefined` e voltava a alimentar o crash da App Library (#689).
              const migrated: RecentApp[] = (parsed as unknown[])
                .filter((pkg): pkg is string => typeof pkg === 'string' && pkg !== '')
                .map((pkg, i) => ({
                  packageName: pkg,
                  launchedAt: Date.now() - i * 60000,
                }));
              setRecentApps(migrated);
              AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(migrated));
            } else {
              // Blob no formato actual: valida entrada a entrada. Uma entrada
              // corrompida derrubava o launcher inteiro no render da App
              // Library (#689).
              const normalized = normalizeRecentApps(parsed);
              setRecentApps(normalized);
              if (normalized.length !== parsed.length) {
                // Reescreve o blob saneado para que o arranque seguinte não
                // volte a pagar a filtragem nem herde o lixo.
                AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(normalized));
              }
            }
          }
        } catch (e) { logger.warn('AppsStore', 'failed to parse recent apps', e); }
      }
    })();
  }, []);

  // Load the "App Library Only" set (#601) — persisted separately from the
  // layout so a reset of the dock/home layout doesn't silently un-hide apps.
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(LIBRARY_ONLY_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setState(prev => ({ ...prev, libraryOnlyApps: parsed.filter((p): p is string => typeof p === 'string') }));
          }
        } catch (e) { logger.warn('AppsStore', 'failed to parse library-only set', e); }
      }
    })();
  }, []);

  const persistLibraryOnly = useCallback((pkgs: string[]) => {
    AsyncStorage.setItem(LIBRARY_ONLY_KEY, JSON.stringify(pkgs));
  }, []);

  // Load the hidden-apps set (#606). Persisted under its own key, separate from
  // both the layout and the library-only set, so resetting either one does not
  // silently reveal apps the user chose to hide.
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(HIDDEN_APPS_KEY);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setState(prev => ({ ...prev, hiddenApps: parsed.filter((p): p is string => typeof p === 'string') }));
        }
      } catch (e) { logger.warn('AppsStore', 'failed to parse hidden apps set', e); }
    })();
  }, []);

  const persistHidden = useCallback((pkgs: string[]) => {
    AsyncStorage.setItem(HIDDEN_APPS_KEY, JSON.stringify(pkgs));
  }, []);

  // Load the protected-apps set (#627). Own key, same reasoning as hiddenApps:
  // independent of every other set so resetting one never silently changes another.
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(PROTECTED_APPS_KEY);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setState(prev => ({ ...prev, protectedApps: parsed.filter((p): p is string => typeof p === 'string') }));
        }
      } catch (e) { logger.warn('AppsStore', 'failed to parse protected apps set', e); }
    })();
  }, []);

  const persistProtected = useCallback((pkgs: string[]) => {
    AsyncStorage.setItem(PROTECTED_APPS_KEY, JSON.stringify(pkgs));
  }, []);

  // #627 child issue: keep the native foreground monitor (ForegroundMonitorService)
  // in sync with the protected set. Whenever the set changes we push it down so
  // the AccessibilityService can gate the app even when launched from outside the
  // launcher (recent apps / share sheet / deep link) — the JS gate in launchApp
  // only covers in-launcher opens. Fail-open here: if the module/binding is
  // unavailable we log and move on; not being able to seed the service must not
  // break the launcher's own launch path.
  const pushProtectedToMonitor = useCallback(async (pkgs: string[]) => {
    try {
      const mod = await getLauncherModule();
      await mod?.setProtectedApps?.(pkgs);
    } catch (e) {
      logger.warn('AppsStore', 'could not push protected apps to monitor', e);
    }
  }, []);

  useEffect(() => {
    // Seed the monitor whenever the protected set settles or changes.
    pushProtectedToMonitor(state.protectedApps);
  }, [state.protectedApps, pushProtectedToMonitor]);

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

  // Resolves the final dock list: ensures our built-in apps are present (max 4),
  // then drops any package that isn't installed (or a virtual built-in).
  const resolveDock = useCallback((apps: InstalledApp[], savedDock: string[]) => {
    let dockApps = savedDock;
    for (const pkg of DEFAULT_DOCK) {
      if (!dockApps.includes(pkg)) {
        dockApps = [...dockApps.slice(0, 3), pkg]; // keep max 4, ensure built-in present
      }
    }
    return dockApps.filter((pkg: string) =>
      apps.some((app: InstalledApp) => app.packageName === pkg) || VIRTUAL_APPS_MAP[pkg]
    ).slice(0, 4); // max 4 in dock
  }, []);

  // Moved above the install/uninstall effect below (was declared after it,
  // near launchApp) so that effect's applyIndex() can persist homeApps
  // position assignments (#760) without a temporal-dead-zone reference to a
  // `const` declared later in the component body.
  const persist = useCallback((dockApps: string[], homeApps: HomeApp[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ dockApps, homeApps }));
  }, []);

  // Forma da máscara dos ícones (#482). Lida do módulo utils/iconShape (mesmo
  // padrão de utils/haptics): o SettingsStore publica-a lá, e este store
  // subscreve — sem acoplar o AppsProvider ao SettingsProvider.
  const [iconMask, setIconMask] = useState<IconMaskOptions>(() => getIconMask());
  useEffect(() => subscribeIconMask(setIconMask), []);
  const iconMaskRef = React.useRef(iconMask);
  iconMaskRef.current = iconMask;

  const loadApps = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    const [savedLayout, cachedIndexRaw] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(APPS_INDEX_KEY),
    ]);

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

    // A cached index lets every arranque but the very first paint the grid
    // immediately, without waiting on the native package scan below.
    let cachedApps: InstalledApp[] | null = null;
    if (cachedIndexRaw) {
      try {
        const parsed = JSON.parse(cachedIndexRaw);
        if (Array.isArray(parsed)) {
          // O blob vem do AsyncStorage (não confiável: build anterior, cache
          // truncado, entrada parcial). A ponte nativa normaliza a SAÍDA
          // (`withCategory`/`dedupeByPackageName`), mas aqui lemos o cache
          // PERSISTIDO, que contorna essa normalização. Sem isto, uma entrada
          // sem `packageName` (chave de React / duplicados) ou sem `name`
          // (que o appsIndexReducer ordena em `.sort(byName)`) chega ao vivo
          // `allApps`, e como a AppLibraryContent é a última página do pager
          // da home, o throw derrubava o launcher → ecrã inicial do Android
          // (#704 / #709). Replicamos a normalização da ponte para o cache.
          const seen = new Set<string>();
          const clean = parsed
            .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && !Array.isArray(e))
            .filter((e) => typeof e.packageName === 'string' && e.packageName !== '' && !seen.has(e.packageName) && (seen.add(e.packageName), true))
            .filter((e) => typeof e.name === 'string')
            .map((e) => ({
              name: e.name as string,
              packageName: e.packageName as string,
              icon: typeof e.icon === 'string' ? e.icon : '',
              isSystem: typeof e.isSystem === 'boolean' ? e.isSystem : false,
            }));
          cachedApps = clean.length > 0 ? clean : null;
        }
      } catch (e) { logger.warn('AppsStore', 'failed to parse cached apps index', e); }
    }

    if (cachedApps) {
      // #760: cachedApps paints immediately, so it needs positions of its own
      // rather than waiting for the native-scan branch below — otherwise the
      // first paint after a fresh install (no homeApps persisted yet) would
      // render with every app falling back to "no position" and jump once
      // the scan-branch setState assigns real ones a moment later. Not
      // persisted here: it's the ephemeral fast-paint state, immediately
      // superseded by the canonical merge below.
      homeApps = assignHomePositions(homeApps, cachedApps);
      setState(prev => ({
        ...prev,
        allApps: cachedApps,
        homeApps,
        dockApps: resolveDock(cachedApps, dockApps),
        isLoading: false,
      }));
    }

    try {
      const LauncherModule = await getLauncherModule();
      if (!LauncherModule) throw new Error('LauncherModule unavailable');

      const [apps, defaultStatus] = await Promise.all([
        LauncherModule.getInstalledApps(iconMask, iconTreatment),
        LauncherModule.isDefaultLauncher(),
      ]);

      setIsDefault(defaultStatus);
      AsyncStorage.setItem(APPS_INDEX_KEY, JSON.stringify(apps));

      // #601: when new apps are set to go to the App Library only, any package
      // we have not seen before (not in the cached index) is seeded into
      // libraryOnlyApps so it lands in the App Library instead of the home
      // screen. Apps already known to the launcher are left untouched — the
      // setting only affects apps first discovered while it is off.
      setState(prev => {
        const known = new Set(cachedApps?.map(c => c.packageName) ?? []);
        const seeded = !newAppsToHome
          ? apps
              .map((a: InstalledApp) => a.packageName)
              .filter((pkg: string) => !prev.libraryOnlyApps.includes(pkg) && !known.has(pkg))
          : [];
        const libraryOnlyApps = seeded.length > 0
          ? [...prev.libraryOnlyApps, ...seeded]
          : prev.libraryOnlyApps;
        if (seeded.length > 0) persistLibraryOnly(libraryOnlyApps);
        // #760: assign a position to any app the saved layout doesn't know
        // about yet — first-ever load (homeApps === []) or a package that
        // was installed while the app wasn't running to catch the broadcast.
        // In scan order, so a clean install reproduces today's visual order.
        const mergedHomeApps = assignHomePositions(homeApps, apps);
        if (mergedHomeApps !== homeApps) persist(dockApps, mergedHomeApps);
        return {
          ...prev,
          allApps: apps,
          homeApps: mergedHomeApps,
          dockApps: resolveDock(apps, dockApps),
          isLoading: false,
          libraryOnlyApps,
        };
      });
    } catch (e) {
      logger.warn('AppsStore', 'background apps refresh failed', e);
      // A cached index is already painted — keep it and refresh silently next time
      // instead of surfacing an error for a scan the user isn't waiting on.
      if (!cachedApps) {
        alertRef.current('Error', 'Could not load apps. Please try again later.');
        setState(prev => ({ ...prev, isLoading: false }));
      }
    }
  }, [resolveDock, iconMask, iconTreatment, newAppsToHome, persistLibraryOnly, persist]);

  // loadApps depende de iconMask, por isso mudar a forma ou o expoente volta a
  // pedir os ícones ao nativo com a chave de cache nova — a grelha actualiza sem
  // reinstalar nem reiniciar.
  useEffect(() => {
    loadApps();
  }, [loadApps]);

  // Install / uninstall / update: refresh only the package the broadcast named.
  // A full loadApps() per event would mean 20 complete package scans when the
  // user restores 20 apps at once (see #485), so the affected entry is patched
  // into the index instead.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let mounted = true;

    // Applies a pure reducer to the index. The reducer returns the SAME array
    // when the event was a no-op (already-known package, unknown removal), and
    // that identity check is what keeps a duplicate broadcast from re-rendering
    // and re-writing the cached index.
    const applyIndex = (reduce: (apps: InstalledApp[]) => InstalledApp[]) => {
      setState(prev => {
        const next = reduce(prev.allApps);
        if (next === prev.allApps) return prev;
        AsyncStorage.setItem(APPS_INDEX_KEY, JSON.stringify(next));
        // #760: a package installed while the launcher is running (broadcast,
        // not a fresh loadApps()) needs its own position — the removed case
        // just shrinks `next`, so assignHomePositions is a no-op for it.
        const homeApps = assignHomePositions(prev.homeApps, next);
        if (homeApps !== prev.homeApps) persist(prev.dockApps, homeApps);
        return { ...prev, allApps: next, homeApps, dockApps: resolveDock(next, prev.dockApps) };
      });
    };

    let unsubscribe = () => {};
    (async () => {
      const mod = await getLauncherModuleExports();
      // A native build older than this JS bundle has no onPackageChanged event
      // and therefore no subscription helper — the grid then behaves as before
      // (refresh on next start) instead of the provider throwing on mount.
      if (!mounted || typeof mod?.addPackageChangedListener !== 'function') return;
      unsubscribe = mod.addPackageChangedListener(async ({ action, packageName }: PackageChange) => {
        if (action === 'removed') {
          applyIndex(prev => removeApp(prev, packageName));
          return;
        }
        // 'added' and 'replaced' both mean "reprocess this package": an update
        // changes the label and the cached icon's versionCode, so the entry has
        // to be re-read rather than left as-is.
        try {
          const LauncherModule = await getLauncherModule();
          const app = await LauncherModule?.getAppInfo(packageName, iconMaskRef.current, iconTreatment);
          if (!mounted || !app) return; // not launchable, or unmounted meanwhile
          applyIndex(prev => upsertApp(prev, app));
        } catch (e) {
          logger.warn('AppsStore', `incremental refresh failed for ${packageName}`, e);
        }
      });
    })();

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [resolveDock, iconTreatment, persist]);

  // Returns whether the launch actually succeeded (#509) — callers that show
  // an icon-expand transition need this to revert it on failure instead of
  // leaving the animation stuck full-screen over a launcher that never left.
  // #781: the decision procedure (protected-apps gate, native launch, recents,
  // error alert) now lives in dispatchLaunchApp — a framework-free primitive
  // any caller can dispatch, not just one running inside this Provider.
  const launchApp = useCallback(async (packageName: string): Promise<boolean> => {
    return dispatchLaunchApp(packageName, {
      isAndroid: Platform.OS === 'android',
      isProtected: (pkg) => protectedAppsRef.current.includes(pkg),
      authenticate: authenticateWithBiometrics,
      launchNative: async (pkg) => {
        // getLauncherModule(), not a bare `await import(...)`: the raw dynamic
        // import throws under Jest ("invoked without --experimental-vm-modules"),
        // which made this whole function silently fail — and therefore
        // untestable — for both protected and unprotected packages alike.
        const LauncherModule = await getLauncherModule();
        return (await LauncherModule?.launchApp(pkg)) ?? false;
      },
      onLaunched: addToRecents,
      onError: (title, message) => alertRef.current(title, message),
    });
  }, [addToRecents]);

  const addToHome = useCallback((packageName: string) => {
    setState(prev => {
      const exists = prev.homeApps.some(a => a.packageName === packageName);
      const homeApps = exists ? prev.homeApps : [...prev.homeApps, { packageName, position: prev.homeApps.reduce((max, a) => Math.max(max, a.position), -1) + 1 }];
      const libraryOnlyApps = prev.libraryOnlyApps.filter(p => p !== packageName);
      if (libraryOnlyApps.length !== prev.libraryOnlyApps.length) persistLibraryOnly(libraryOnlyApps);
      persist(prev.dockApps, homeApps);
      return { ...prev, homeApps, libraryOnlyApps };
    });
  }, [persist, persistLibraryOnly]);

  const removeFromHome = useCallback((packageName: string) => {
    setState(prev => {
      const homeApps = prev.homeApps.filter(a => a.packageName !== packageName);
      const libraryOnlyApps = prev.libraryOnlyApps.includes(packageName)
        ? prev.libraryOnlyApps
        : [...prev.libraryOnlyApps, packageName];
      persist(prev.dockApps, homeApps);
      persistLibraryOnly(libraryOnlyApps);
      return { ...prev, homeApps, libraryOnlyApps };
    });
  }, [persist, persistLibraryOnly]);

  const swapHomeApps = useCallback((packageA: string, packageB: string) => {
    setState(prev => {
      const homeApps = swapHomePositions(prev.homeApps, packageA, packageB);
      if (homeApps === prev.homeApps) return prev;
      persist(prev.dockApps, homeApps);
      return { ...prev, homeApps };
    });
  }, [persist]);

  // #762: sorts by current position (stable — Array.prototype.sort is stable
  // since ES2019, and ties can't happen because positions are unique) then
  // renumbers 0..n-1. Relative order survives; only the holes disappear.
  const compactHomeLayout = useCallback(() => {
    setState(prev => {
      const homeApps = [...prev.homeApps]
        .sort((a, b) => a.position - b.position)
        .map((a, i) => ({ ...a, position: i }));
      persist(prev.dockApps, homeApps);
      return { ...prev, homeApps };
    });
  }, [persist]);

  const hideApp = useCallback((packageName: string) => {
    setState(prev => {
      // Idempotent: a double long-press must not push the package twice, and
      // must not rewrite storage for a no-op.
      if (prev.hiddenApps.includes(packageName)) return prev;
      const hiddenApps = [...prev.hiddenApps, packageName];
      persistHidden(hiddenApps);
      return { ...prev, hiddenApps };
    });
  }, [persistHidden]);

  const unhideApp = useCallback((packageName: string) => {
    setState(prev => {
      if (!prev.hiddenApps.includes(packageName)) return prev;
      const hiddenApps = prev.hiddenApps.filter(p => p !== packageName);
      persistHidden(hiddenApps);
      return { ...prev, hiddenApps };
    });
  }, [persistHidden]);

  const protectApp = useCallback((packageName: string) => {
    setState(prev => {
      // Idempotent, same reasoning as hideApp above.
      if (prev.protectedApps.includes(packageName)) return prev;
      const protectedApps = [...prev.protectedApps, packageName];
      persistProtected(protectedApps);
      return { ...prev, protectedApps };
    });
  }, [persistProtected]);

  const unprotectApp = useCallback((packageName: string) => {
    setState(prev => {
      if (!prev.protectedApps.includes(packageName)) return prev;
      const protectedApps = prev.protectedApps.filter(p => p !== packageName);
      persistProtected(protectedApps);
      return { ...prev, protectedApps };
    });
  }, [persistProtected]);

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

  // Re-check "am I the default launcher?" whenever the app comes back to the
  // foreground.
  //
  // `isDefault` was only ever written inside loadApps(), which runs on mount.
  // So the flow that matters most got it wrong: you tap "Set Now", Android's
  // home-launcher picker opens, you choose this app, you come back — and
  // nothing re-reads the status. The "Set as default launcher" banner stayed up
  // even though the launcher WAS now the default, until something else happened
  // to re-run loadApps or the app was restarted.
  //
  // A foreground transition is exactly the moment the answer can have changed,
  // because changing it requires leaving the app for the system picker.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let cancelled = false;

    const recheck = async () => {
      try {
        const LauncherModule = await getLauncherModule();
        const status = await LauncherModule?.isDefaultLauncher();
        if (!cancelled && typeof status === 'boolean') setIsDefault(status);
      } catch (e) {
        // Never surface this: it is a background refresh of a banner's
        // visibility, not something the user asked for.
        logger.warn('AppsStore', 'default-launcher re-check failed', e);
      }
    };

    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') recheck();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const openLauncherSettings = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      const LauncherModule = (await import('../../modules/launcher-module/src')).default;
      await LauncherModule.openLauncherSettings();
    } catch {
      alertRef.current('Error', 'Could not open launcher settings.');
    }
  }, []);

  const refreshIconCacheSize = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      const LauncherModule = await getLauncherModule();
      if (!LauncherModule) return;
      const bytes = await LauncherModule.getIconCacheSizeBytes();
      setIconCacheSizeBytes(typeof bytes === 'number' && Number.isFinite(bytes) ? bytes : 0);
    } catch (e) {
      logger.warn('AppsStore', 'getIconCacheSizeBytes failed', e);
    }
  }, []);

  useEffect(() => {
    refreshIconCacheSize();
  }, [refreshIconCacheSize]);

  // Manual rebuild (#486): delete every cached PNG, then redraw them one
  // package at a time so isRebuildingIconCache/iconCacheRebuildProgress track
  // real work done instead of jumping from 0 to 100 around a single batched
  // call — and so each await yields back to the UI thread between icons.
  const rebuildIconCache = useCallback(async () => {
    if (Platform.OS !== 'android' || isRebuildingRef.current) return;
    isRebuildingRef.current = true;
    setIsRebuildingIconCache(true);
    try {
      const LauncherModule = await getLauncherModule();
      if (!LauncherModule) return;
      await LauncherModule.clearIconCache();
      const packageNames = state.allApps.map(app => app.packageName);
      setIconCacheRebuildProgress({ done: 0, total: packageNames.length });
      for (let i = 0; i < packageNames.length; i++) {
        try {
          // O 2º argumento é a MÁSCARA (forma/expoente da #482), não o
          // tratamento: passar o tratamento nesse slot faria o redraw usar a
          // forma DEFAULT e ignorar a forma escolhida pelo utilizador.
          await LauncherModule.getAppInfo(packageNames[i], iconMaskRef.current, iconTreatment);
        } catch (e) {
          logger.warn('AppsStore', `rebuildIconCache: redraw failed for ${packageNames[i]}`, e);
        }
        setIconCacheRebuildProgress({ done: i + 1, total: packageNames.length });
      }
      await refreshIconCacheSize();
    } finally {
      isRebuildingRef.current = false;
      setIsRebuildingIconCache(false);
      setIconCacheRebuildProgress(null);
    }
  }, [state.allApps, iconTreatment, refreshIconCacheSize]);

  const dockApps = useMemo(() =>
    state.dockApps
      .map(pkg => state.allApps.find(a => a.packageName === pkg) || VIRTUAL_APPS_MAP[pkg])
      .filter(Boolean) as InstalledApp[],
    [state.dockApps, state.allApps]
  );

  const nonDockApps = useMemo(() =>
    state.allApps.filter(a =>
      !state.dockApps.includes(a.packageName)
      && !state.libraryOnlyApps.includes(a.packageName)
      && !state.hiddenApps.includes(a.packageName)),
    [state.allApps, state.dockApps, state.libraryOnlyApps, state.hiddenApps],
  );

  const visibleApps = useMemo(() =>
    state.allApps.filter(a => !state.hiddenApps.includes(a.packageName)),
    [state.allApps, state.hiddenApps],
  );

  // Derive recentPackages (string[]) for backward compatibility
  const recentPackages = useMemo(() => recentApps.map(r => r.packageName), [recentApps]);

  const value = useMemo(() => ({
    apps: state.allApps,
    homeApps: state.homeApps,
    dockApps,
    nonDockApps,
    libraryOnlyApps: state.libraryOnlyApps,
    hiddenApps: state.hiddenApps,
    protectedApps: state.protectedApps,
    visibleApps,
    recentPackages,
    recentApps,
    isLoading: state.isLoading,
    launchApp,
    addToHome,
    removeFromHome,
    swapHomeApps,
    compactHomeLayout,
    hideApp,
    unhideApp,
    protectApp,
    unprotectApp,
    addToDock,
    removeFromDock,
    removeFromRecents,
    clearRecents,
    isDefaultLauncher: isDefault,
    openLauncherSettings,
    // Perdido no merge: a interface (do lado deste branch) declara refreshApps, o
    // corpo do value veio do main, que ainda nao a tinha. loadApps e a
    // implementacao, como no branch original (AppsStore.tsx:345).
    refreshApps: loadApps,
    iconCacheSizeBytes,
    isRebuildingIconCache,
    iconCacheRebuildProgress,
    rebuildIconCache,
  }), [state, dockApps, nonDockApps, visibleApps, recentPackages, recentApps, isDefault, launchApp, addToHome, removeFromHome, swapHomeApps, compactHomeLayout, hideApp, unhideApp, protectApp, unprotectApp, addToDock, removeFromDock, removeFromRecents, clearRecents, openLauncherSettings, loadApps, iconCacheSizeBytes, isRebuildingIconCache, iconCacheRebuildProgress, rebuildIconCache]);

  return <AppsContext.Provider value={value}>{children}</AppsContext.Provider>;
}

export function useApps() {
  const ctx = useContext(AppsContext);
  if (!ctx) throw new Error('useApps must be used within AppsProvider');
  return ctx;
}
