import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LauncherModuleType } from '../../modules/launcher-module/src';
import { setHapticsEnabled } from '../utils/haptics';
import {
  type IconShape,
  DEFAULT_ICON_SHAPE_EXPONENT,
  normalizeIconShape,
  clampIconShapeExponent,
  setIconMask,
} from '../utils/iconShape';
import {
  type CategoryOverrideSettings,
  DEFAULT_CATEGORY_OVERRIDES,
} from '../utils/categoryOverrides';
import {
  type RequirePasscodeAfter,
  DEFAULT_REQUIRE_PASSCODE_AFTER,
} from '../utils/passcodePolicy';
import { clampWhitePointLevel } from '../utils/whitePoint';

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
  hotspotMaxCompatibility: boolean;
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
  /**
   * Início do horário do Focus agendado, 'HH:MM' 24h. Só relevante quando
   * `focusScheduleEnabled` está true. Default '09:00' (iOS Work por omissão).
   */
  focusScheduleStart: string;
  /**
   * Fim do horário do Focus agendado, 'HH:MM' 24h. Só relevante quando
   * `focusScheduleEnabled` está true. Default '17:00'.
   */
  focusScheduleEnd: string;
  screenTimeEnabled: boolean;
  dailyLimit: number;
  downtime: boolean;
  downtimeStart: string;
  downtimeEnd: string;
  textSizeIndex: number;
  trueTone: boolean;
  autoLock: string;
  raiseToWake: boolean;
  /** When true, tapping the (app-dimmed) screen wakes it — Tap to Wake (#608). */
  tapToWake: boolean;
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
  wallpaperIndex: number;
  reduceMotion: boolean;
  reduceTransparency: boolean;
  /** iOS «Reduce White Point»: dims the brightest colours via a dark overlay over the root container. */
  reduceWhitePoint: boolean;
  /** Overlay opacity (1 - whitePointLevel). Gama 0.25–1.0; 1.0 = sem redução. Default 1.0. */
  whitePointLevel: number;
  boldText: boolean;
  showLockScreen: boolean;
  biometricUnlock: boolean;
  /**
   * iOS «Face ID & Passcode → iPhone Unlock»: usar biometria para desbloquear o
   * launcher. Sub-opção de `biometricUnlock`, que continua a ser o master
   * on/off — com o master desligado esta não tem efeito nenhum.
   */
  faceIdForUnlock: boolean;
  /**
   * iOS «Face ID & Passcode → Require Passcode»: quanto tempo depois do último
   * desbloqueio é que voltar ao ecrã de bloqueio exige autenticação. O default
   * 'immediately' reproduz o comportamento anterior a #611.
   */
  requirePasscodeAfter: RequirePasscodeAfter;
  showSearchLabel: boolean;
  automaticUpdates: boolean;
  updateAvailable: boolean;
  scheduledSummaryIdx: number;
  fontChoice: 'inter' | 'system';
  /**
   * Whether the squircle mask (#480) is applied to app icons before caching.
   * 'mask-adaptive-only' leaves already-circular/self-shaped icons untouched
   * (masking those crops visible corners empty), 'mask-all' masks every icon
   * (the pre-#486 behaviour), 'none' is the unmasked baseline.
   */
  iconTreatment: 'mask-all' | 'mask-adaptive-only' | 'none';
  pressFeedback: 'scale-opacity' | 'opacity' | 'none';
  /** Home-screen grid columns (§2 derivation, issue #503). */
  gridColumns: 3 | 4 | 5 | 6;
  /** Home-screen grid rows per page (issue #503). */
  gridRows: 4 | 5 | 6 | 7;
  /** Multiplier over the spec's 0.153 x screen-width icon size (issue #503). */
  iconSizeScale: number;
  /** Whether app names render under grid icons (issue #503). */
  showIconLabels: boolean;
  /**
   * Whether the home-screen page dots (iOS «Home Screen & Dock → Show Page
   * Dots») render when there is more than one page. Independent of
   * `showIconLabels` — one hides the app-name text, the other hides the
   * pagination indicator. Default true (iOS shows dots unless toggled off).
   */
  showPageDots: boolean;
  /**
   * Whether the icon-expand animation plays when opening an app (§6.3).
   * Independent of `reduceMotion`: turning this off skips only the
   * icon-expand overlay, not other motion in the app. `reduceMotion` (or,
   * once #467 lands, `motionIntensity: 'off'`) still takes precedence over
   * this — see the precedence table in LauncherHomeScreen.handleAppPress.
   */
  appLaunchAnimation: boolean;
  /** Target duration of the icon-expand animation in ms, 150–450 (§6.3, default 280 = value [E]). */
  appLaunchDurationMs: number;
  /**
   * Forma da máscara dos ícones do launcher (§1.6). 'original' = sem máscara,
   * o drawable como o sistema o dá — é também o baseline de comparação.
   */
  iconShape: IconShape;
  /**
   * Expoente do superelipse do squircle. Gama útil 2.0–8.0; a especificação
   * admite que 4.7 é um palpite que precisa de aferição, daí ser regulável.
   * Só afecta a forma 'squircle' (ver effectiveIconExponent).
   */
  iconShapeExponent: number;
  /**
   * Overrides de categorias da App Library (#516): ocultar, renomear, reordenar
   * categorias e recategorizar apps individualmente. Toda a lógica opera sobre
   * chaves estáveis (ex.: 'social'), nunca sobre o nome exibido, para que
   * renomear não parta a atribuição.
   */
  categoryOverrides: CategoryOverrideSettings;
  /**
   * App Library — «Home Screen & Dock → App Library» no iOS. `showSuggestions`
   * controla a faixa Recently Added + Suggestions (a "sugestões" do iOS);
   * `showNotifications` controla se as apps dentro da App Library exibem o
   * badge/dot de notificações não lidas. Ambos default true (#602).
   */
  appLibraryShowNotifications: boolean;
  appLibraryShowSuggestions: boolean;
  /**
   * Newly Downloaded Apps destination (iOS «Home Screen & Dock → Newly
   * Downloaded Apps»). When true (default) a freshly installed app is shown on
   * the home screen; when false it appears only in the App Library. Already-
   * installed apps are never moved — the setting only affects apps first seen
   * after it was turned off (#601).
   */
  newAppsToHome: boolean;
  /**
   * Status bar appearance (iOS «Display & Brightness → Appearance → Style» /
   * «Home Screen & Dock → Status Bar»). 'light' forces light-content, 'dark'
   * forces dark-content, 'auto' (default) follows the active theme. Independent
   * of `showPageDots`/theme switches — this is the user's explicit override.
   */
  statusBarStyle: 'light' | 'dark' | 'auto';
  /**
   * Whether the status bar is shown on the home screen (iOS «Home Screen &
   * Dock → Show Status Bar»). Default true. When false, the home-screen
   * StatusBar is hidden (the launcher chrome moves up to fill the gap).
   */
  statusBarVisible: boolean;
  /**
   * iOS «Display & Brightness → Auto-Brightness»: when true (default) the OS
   * ambient-light sensor drives the screen brightness; the manual brightness
   * slider is disabled and the device stays in AUTOMATIC brightness mode. When
   * false, the slider takes over with `Brightness.setBrightnessAsync` and the
   * device is switched to MANUAL brightness mode (#612).
   */
  autoBrightness: boolean;
  /**
   * Siri & Search → Suggestions (#610). When false the App Library's
   * «Suggestions» strip is not rendered. Independent of the two visibility
   * toggles below: this only removes the suggestion strip, not the apps.
   */
  searchShowSuggestions: boolean;
  /**
   * Siri & Search → Show App in Search (#610). When false apps are excluded
   * from Spotlight's «Apps» section (and from the App Library's own search
   * field); other Spotlight sections are untouched.
   */
  searchShowInSearch: boolean;
  /**
   * Siri & Search → Show in App Library (#610). When false the App Library
   * shows no apps at all: no strips, no category cards. Apps stay installed
   * and remain launchable from the home screen.
   */
  searchShowInLibrary: boolean;
  /**
   * Dark Mode «Automatic» with a custom schedule (iOS «Display & Brightness →
   * Appearance → Automatic → Custom Schedule»). When true, the launcher follows
   * its own Light Until / Dark Until hours instead of the system color scheme.
   * Only meaningful while `mode` is 'system' (see ThemeContext.resolveIsDark).
   * Default false — the pre-existing behaviour (follow the OS) is preserved.
   */
  darkModeAutomatic: boolean;
  /**
   * "Light Until" hour for the custom Dark Mode schedule, 'HH:MM' 24h. The
   * launcher renders light from midnight up to (and excluding) this instant,
   * then dark until `darkModeDarkUntil` the next morning. Default '07:00'
   * matches the iOS custom-schedule default of "Light until 7:00 AM".
   */
  darkModeLightUntil: string;
  /**
   * "Dark Until" hour for the custom Dark Mode schedule, 'HH:MM' 24h. The
   * launcher renders dark from `darkModeLightUntil` up to (and excluding) this
   * instant, then light again. Default '19:00' matches the iOS default of
   * "Dark until 7:00 PM".
   */
  darkModeDarkUntil: string;
  /**
   * Override local do tipo de dispositivo Bluetooth, por endereço (issue #615).
   * O native devolve o tipo real (`device.type`), mas o utilizador pode
   * sobrepô-lo no "i" de cada dispositivo emparelhado (Coluna / Auscultadores /
   * Rádio do Carro / Outro) — isto calibra o ícone e a intenção de uso. É um
   * override puramente visual/local; o Headphone Safety real é do SO Android.
   * Chaveado por `device.address` (estável), nunca pelo nome exibido.
   */
  bluetoothDeviceTypes: Record<string, 'speaker' | 'headphones' | 'car' | 'other'>;
}

export const DEFAULT_SETTINGS: SettingsState = {
  airplaneMode: false,
  wifiEnabled: true,
  wifiNetwork: 'Home',
  bluetoothEnabled: true,
  bluetoothName: 'iosToAndroid',
  cellularDataEnabled: true,
  hotspotEnabled: false,
  hotspotPassword: '',
  hotspotMaxCompatibility: false,
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
  focusScheduleStart: '09:00',
  focusScheduleEnd: '17:00',
  screenTimeEnabled: false,
  dailyLimit: 60,
  downtime: false,
  downtimeStart: '22:00',
  downtimeEnd: '07:00',
  textSizeIndex: 1,
  trueTone: true,
  autoLock: '5 Minutes',
  raiseToWake: true,
  tapToWake: false,
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
  wallpaperIndex: 0,
  reduceMotion: false,
  reduceTransparency: false,
  reduceWhitePoint: false,
  whitePointLevel: 1.0,
  boldText: false,
  showLockScreen: true,
  biometricUnlock: true,
  faceIdForUnlock: true,
  requirePasscodeAfter: DEFAULT_REQUIRE_PASSCODE_AFTER,
  showSearchLabel: true,
  automaticUpdates: true,
  updateAvailable: false,
  scheduledSummaryIdx: 0,
  fontChoice: 'inter',
  iconTreatment: 'mask-adaptive-only',
  pressFeedback: 'scale-opacity',
  gridColumns: 4,
  gridRows: 6,
  iconSizeScale: 1.0,
  showIconLabels: true,
  showPageDots: true,
  appLaunchAnimation: true,
  appLaunchDurationMs: 280,
  iconShape: 'squircle',
  iconShapeExponent: DEFAULT_ICON_SHAPE_EXPONENT,
  categoryOverrides: DEFAULT_CATEGORY_OVERRIDES,
  newAppsToHome: true,
  appLibraryShowNotifications: true,
  appLibraryShowSuggestions: true,
  statusBarStyle: 'auto',
  statusBarVisible: true,
  autoBrightness: true,
  searchShowSuggestions: true,
  searchShowInSearch: true,
  searchShowInLibrary: true,
  darkModeAutomatic: false,
  darkModeLightUntil: '07:00',
  darkModeDarkUntil: '19:00',
  bluetoothDeviceTypes: {},
};

interface SettingsContextValue {
  settings: SettingsState;
  update: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  updateMany: (partial: Partial<SettingsState>) => void;
  reset: () => void;
  syncFromDevice: () => Promise<void>;
  isReady: boolean;
  /** The currently active focus mode, or null if no focus is active. */
  activeFocusMode: string | null;
  /** Activate or deactivate a focus mode. Pass null to disable all focus. */
  setFocusMode: (mode: string | null) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({
  children,
  gateFirstRender = true,
}: {
  children: React.ReactNode;
  /**
   * Hold back the first render until AsyncStorage has loaded and the initial
   * device sync has completed, so the UI never flashes default settings before
   * the real ones arrive.
   *
   * Consumers that render synchronously and cannot wait for that round trip pass
   * `false` — notably the test harness (`src/test-utils.tsx`). With the gate on,
   * a synchronous render returns `null` for the whole subtree, which is why every
   * screen test used to fail with "Unable to find an element with text: ...".
   */
  gateFirstRender?: boolean;
}) {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [isReady, setIsReady] = useState(false);
  const [firstSyncDone, setFirstSyncDone] = useState(false);

  // mountedRef — guard all async setState calls against post-unmount updates
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setSettings((prev) => ({
            ...prev,
            ...parsed,
            // A forma e o expoente descem até ao Kotlin e definem a chave da
            // cache de ícones: um valor corrompido no AsyncStorage produziria
            // uma máscara indefinida, por isso normaliza-se na leitura.
            iconShape: normalizeIconShape(parsed?.iconShape),
            iconShapeExponent: clampIconShapeExponent(parsed?.iconShapeExponent),
            // whitePointLevel tem de ficar na gama 0.25–1.0; um valor
            // corrompido (NaN, fora da gama) faria um overlay com opacidade
            // inválida, por isso normaliza-se na leitura.
            whitePointLevel: clampWhitePointLevel(parsed?.whitePointLevel),
          }));
        } catch { /* ignore */ }
      }
      setIsReady(true);
    });
  }, []);

  useEffect(() => {
    if (isReady) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings, isReady]);

  // Read real device state and sync it into settings
  const syncFromDevice = useCallback(async () => {
    const getLauncherModule = async () => {
      try {
        // require(), not `await import(...)`: Metro has no real code-splitting
        // for RN apps, so both compile to the same synchronous module load at
        // runtime — but a bare `import()` throws under Jest's CommonJS test
        // environment (ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG), which
        // silently made this catch swallow every call and left syncFromDevice
        // a permanent no-op in every test in the suite. require() goes through
        // Jest's normal resolver (and moduleNameMapper), so it's mockable.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return (require('../../modules/launcher-module/src') as { default: LauncherModuleType }).default;
      } catch { return null; }
    };

    const partial: Partial<SettingsState> = {};

    // Timezone — always read from JS runtime (reflects system timezone)
    partial.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // WiFi and Bluetooth — read from native module on Android
    try {
      const mod = await getLauncherModule();
      if (mod) {
        const [wifiInfo, btInfo] = await Promise.all([
          mod.getWifiInfo().catch(() => null),
          mod.getBluetoothInfo().catch(() => null),
        ]);
        if (wifiInfo !== null) {
          partial.wifiEnabled = wifiInfo.enabled;
          if (wifiInfo.ssid) partial.wifiNetwork = wifiInfo.ssid;
        }
        if (btInfo !== null) {
          partial.bluetoothEnabled = btInfo.enabled;
          if (btInfo.name) partial.bluetoothName = btInfo.name;
        }
      }
    } catch { /* native module unavailable on non-Android */ }

    if (!mountedRef.current) return;
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  // Initial device sync after AsyncStorage load — gate first render on completion
  useEffect(() => {
    if (!isReady) return;
    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      // safety fallback: never block UI more than 500ms
      fallbackTimer = setTimeout(() => { if (!cancelled) setFirstSyncDone(true); }, 500);
      try {
        await syncFromDevice();
      } catch { /* swallow */ }
      if (!cancelled) {
        if (fallbackTimer) clearTimeout(fallbackTimer);
        setFirstSyncDone(true);
      }
    })();
    return () => {
      cancelled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [isReady, syncFromDevice]);

  // Re-sync when app comes to foreground (user may have changed settings in system UI)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') { syncFromDevice(); }
    });
    return () => sub.remove();
  }, [syncFromDevice]);

  // Sync vibration setting to haptics cache
  useEffect(() => {
    setHapticsEnabled(settings.vibration !== false);
  }, [settings.vibration]);

  // Publica a forma dos ícones (#482) para o AppsStore, que a passa à ponte
  // nativa. setIconMask é no-op quando a chave de cache não muda, por isso
  // reescolher a mesma forma não dispara um varrimento novo.
  useEffect(() => {
    setIconMask(settings.iconShape, settings.iconShapeExponent);
  }, [settings.iconShape, settings.iconShapeExponent]);

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

  /** setFocusMode: convenience wrapper that updates the focusMode setting.
   *  Pass null or 'off' to disable focus mode. */
  const setFocusMode = useCallback((mode: string | null) => {
    const resolved = (mode === null ? 'off' : mode) as SettingsState['focusMode'];
    setSettings((prev) => ({ ...prev, focusMode: resolved }));
  }, []);

  /** activeFocusMode: null when focus is off, otherwise the current mode string. */
  const activeFocusMode = settings.focusMode === 'off' ? null : settings.focusMode;

  const value = useMemo(
    () => ({ settings, update, updateMany, reset, syncFromDevice, isReady, activeFocusMode, setFocusMode }),
    [settings, update, updateMany, reset, syncFromDevice, isReady, activeFocusMode, setFocusMode],
  );

  if (gateFirstRender && !firstSyncDone) return null;

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
