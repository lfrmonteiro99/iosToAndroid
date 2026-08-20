import React, { useState, useEffect, useRef } from 'react';
import { View, AppState, BackHandler, Platform, Pressable, StatusBar as RNStatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './src/navigation/types';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { SettingsProvider, useSettings } from './src/store/SettingsStore';
import { ContactsProvider } from './src/store/ContactsStore';
import { ProfileProvider } from './src/store/ProfileStore';
import { AppsProvider } from './src/store/AppsStore';
import { DeviceProvider, useDevice } from './src/store/DeviceStore';
import { FoldersProvider } from './src/store/FoldersStore';
import { TabNavigator } from './src/navigation/TabNavigator';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { AlertProvider } from './src/components/AlertProvider';
import { NotificationBanner, BannerNotification } from './src/components/NotificationBanner';
import { HomeIndicator } from './src/components/HomeIndicator';
import { QuickSwitchHomeBar } from './src/components/QuickSwitchHomeBar';
import { GestureHost } from './src/components/GestureHost';
import { AssistiveTouch } from './src/components/AssistiveTouch';
import { AssistiveTouchProvider, useAssistiveTouch } from './src/store/AssistiveTouchStore';
import { LockScreen } from './src/screens/LockScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { findContactByPhone } from './src/utils/contacts';
import { suppressAutoLock } from './src/utils/permissions';
import { resolveAutoLockDelay } from './src/utils/autoLockUtils';
import LauncherModule, { addNotificationListener, onBridgeError } from './modules/launcher-module/src';
import { notificationCallbackForFocus } from './src/utils/notificationFocusFilter';

function AppContent() {
  const { isDark } = useTheme();
  const device = useDevice();
  const { settings } = useSettings();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const [isLocked, setIsLocked] = useState(true);

  // ── Botão físico de voltar na raiz ────────────────────────────────────────
  //
  // O #445 desligou o `predictiveBackGestureEnabled`, que era o que impedia o
  // evento de chegar ao React Navigation. Com isso resolvido o back navega — mas
  // no `HomeMain`, que é a RAIZ da stack, não há para onde voltar, ninguém
  // consome o evento, ele cai na Activity e esta termina. Resultado: o utilizador
  // sai do launcher, e nota-se sobretudo logo a seguir a desbloquear, que é
  // quando se espera aterrar na home.
  //
  // Um launcher não deve poder ser fechado com o back — é o comportamento do
  // Pixel Launcher, do One UI Home e do próprio iOS. Mas isso só vale quando a
  // app É o launcher: numa app normal, sair no back é o correcto, e por isso o
  // handler distingue os dois casos em vez de bloquear sempre.
  const [isDefaultLauncher, setIsDefaultLauncher] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mod = (await import('./modules/launcher-module/src')).default;
        const is = await mod.isDefaultLauncher();
        if (alive) setIsDefaultLauncher(!!is);
      } catch {
        // Módulo indisponível (não-Android): fica falso, comportamento de app normal.
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Ecrã bloqueado: o back nunca deve contornar o bloqueio.
      if (isLocked) return true;
      // Há para onde voltar: deixa o React Navigation tratar (não regride o #445).
      if (navigationRef.current?.canGoBack()) return false;
      // Raiz: consome se formos o launcher, deixa fechar se não formos.
      return isDefaultLauncher;
    });
    return () => sub.remove();
  }, [isLocked, isDefaultLauncher, navigationRef]);
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [banner, setBanner] = useState<BannerNotification | null>(null);

  // Track last known message count to detect new messages
  const lastMsgCount = useRef(0);

  // IDs of native notifications we've already surfaced as banners — prevents
  // re-showing the same notification on every poll cycle.
  const seenNotifIds = useRef<Set<string>>(new Set());

  // Mirror of settings.focusMode kept in a ref so the notification listener
  // callback (registered once) always reads the current value without stale closure.
  const focusModeRef = useRef(settings.focusMode);
  useEffect(() => { focusModeRef.current = settings.focusMode; }, [settings.focusMode]);

  // Pending auto-lock timer. We don't lock the instant the app goes to
  // background — a permission dialog, the system HOME intent fired by our
  // own AssistiveTouch/HomeIndicator, or any other transient focus loss all
  // background the activity for a fraction of a second. Only lock if we're
  // still backgrounded after a short grace period.
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoLockDelay = resolveAutoLockDelay(settings.autoLock);

  // Methods called on a tight poll or continuous listener — never banner them
  // (getRecentMessages: every 30 s in DeviceStore setInterval)
  const BANNER_SUPPRESSED = useRef(new Set(['getRecentMessages'])).current;
  const SILENCE_MS = 30_000;
  const lastErrorTime = useRef<Record<string, number>>({});

  const ERROR_LABELS: Record<string, string> = {
    getWifiInfo: 'Não foi possível ler o estado do Wi-Fi',
    getWifiNetworks: 'Não foi possível listar redes Wi-Fi',
    forgetWifiNetwork: 'Não foi possível esquecer a rede Wi-Fi',
    setWifiEnabled: 'Não foi possível alterar o estado do Wi-Fi',
    getBluetoothInfo: 'Não foi possível ler o estado do Bluetooth',
    setBluetoothEnabled: 'Não foi possível alterar o estado do Bluetooth',
    getStorageInfo: 'Não foi possível ler o armazenamento',
    getVolume: 'Não foi possível ler o volume',
    setVolume: 'Não foi possível alterar o volume',
    getCallLog: 'Não foi possível ler o registo de chamadas',
    makeCall: 'Não foi possível efectuar a chamada',
    sendSms: 'Não foi possível enviar a mensagem',
    requestAllPermissions: 'Não foi possível pedir permissões',
    checkPermissions: 'Não foi possível verificar permissões',
    getCalendarEvents: 'Não foi possível ler o calendário',
    getNotifications: 'Não foi possível ler as notificações',
    getInstalledApps: 'Não foi possível ler as aplicações instaladas',
    launchApp: 'Não foi possível abrir a aplicação',
    getNetworkInfo: 'Não foi possível ler o estado da rede',
    getNowPlaying: 'Não foi possível ler a música atual',
  };

  // Surface native bridge errors as notification banners (deny-list + anti-spam)
  useEffect(() => {
    const unsub = onBridgeError((method, error) => {
      if (BANNER_SUPPRESSED.has(method)) return;

      const now = Date.now();
      if (now - (lastErrorTime.current[method] ?? 0) < SILENCE_MS) return;
      lastErrorTime.current[method] = now;

      const msg = error instanceof Error ? error.message : String(error);
      setBanner({
        id: `error-${now}`,
        appName: 'System',
        iconName: 'warning-outline',
        iconColor: '#FF9500',
        title: ERROR_LABELS[method] ?? `${method} falhou`,
        body: msg || 'Ocorreu um erro. Tente novamente.',
      });
    });
    return unsub;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Immersive mode — hide system bars globally so all screens benefit
  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync('hidden');
      NavigationBar.setBehaviorAsync('overlay-swipe');
      RNStatusBar.setHidden(true, 'slide');
      RNStatusBar.setTranslucent(true);
      RNStatusBar.setBackgroundColor('transparent');
    }
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('@iostoandroid/onboarding_done').then(val => {
      setShowOnboarding(val !== 'true');
    });
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        if (suppressAutoLock()) return; // a permission dialog is showing — ignore background
        if (lockTimer.current) clearTimeout(lockTimer.current);
        if (autoLockDelay !== null) {
          lockTimer.current = setTimeout(() => {
            setIsLocked(true);
            lockTimer.current = null;
          }, autoLockDelay);
        }
      } else if (state === 'active') {
        // Returning within the grace period — cancel pending lock.
        if (lockTimer.current) {
          clearTimeout(lockTimer.current);
          lockTimer.current = null;
        }
        if (Platform.OS === 'android') {
          // Re-assert immersive mode — Android can restore system bars on resume
          NavigationBar.setVisibilityAsync('hidden');
          RNStatusBar.setHidden(true, 'slide');
        }
      }
    });
    return () => {
      sub.remove();
      if (lockTimer.current) clearTimeout(lockTimer.current);
    };
  }, [autoLockDelay]);

  // Monitor for new messages and show banner
  useEffect(() => {
    if (!device.isReady || isLocked) return;

    const inboxMessages = device.messages.filter(m => m.type === 1); // type 1 = inbox/received
    const currentCount = inboxMessages.length;

    if (lastMsgCount.current > 0 && currentCount > lastMsgCount.current) {
      // New message arrived
      const newest = inboxMessages[0]; // messages are sorted newest first
      if (newest) {
        // Resolve contact name
        const contact = findContactByPhone(newest.address || '', device.contacts);

        setBanner({
          id: newest.id,
          appName: 'Messages',
          iconName: 'chatbubble-ellipses',
          iconColor: '#34C759',
          title: contact ? `${contact.firstName} ${contact.lastName}`.trim() : newest.address,
          body: newest.body,
          onPress: () => {
            try {
              (navigationRef as any).navigate('Conversation', { address: newest.address }); // eslint-disable-line @typescript-eslint/no-explicit-any
            } catch { /* navigation not ready */ }
          },
        });
      }
    }

    lastMsgCount.current = currentCount;
  }, [device.messages, device.isReady, device.contacts, isLocked, navigationRef]);

  // Monitor native notifications via event-driven listener (replaces 30s polling)
  useEffect(() => {
    if (!device.isReady || isLocked) return;
    if (Platform.OS !== 'android') return;

    let unsub: (() => void) | undefined;

    (async () => {
      try {
        const access = await LauncherModule.isNotificationAccessGranted();
        if (!access) return;

        // Initial paint: hydrate seenNotifIds with current list so the first
        // event-driven banner is genuinely new.
        const initial = await LauncherModule.getNotifications();
        for (const n of initial) seenNotifIds.current.add(n.id);

        unsub = addNotificationListener((n) => {
          notificationCallbackForFocus(n, seenNotifIds, focusModeRef, setBanner);
        });
      } catch { /* ignore */ }
    })();

    return () => { if (unsub) unsub(); };
  }, [device.isReady, isLocked]);

  if (showOnboarding === null) return null;

  if (showOnboarding) {
    return (
      <OnboardingScreen
        onDone={() => {
          setShowOnboarding(false);
          AsyncStorage.setItem('@iostoandroid/onboarding_done', 'true');
        }}
      />
    );
  }

  if (isLocked) {
    return <LockScreen onUnlock={() => setIsLocked(false)} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? 'light' : 'dark'} hidden />
      <ReachabilityShifter>
        <GestureHost>
          <NavigationContainer ref={navigationRef}>
            <TabNavigator />
          </NavigationContainer>
        </GestureHost>
      </ReachabilityShifter>

      {/* Horizontal quick-switch strip — sits one z-level below the pill so
          vertical gestures on the pill still win. Handles leftward/rightward
          swipes on the home-bar zone to switch to recent apps. */}
      <QuickSwitchHomeBar />

      {/* iOS-style home indicator — floats above every screen and owns the
          swipe-up-to-home / swipe-up-and-hold-for-switcher gesture. */}
      <HomeIndicator navigationRef={navigationRef} />

      {/* iOS-style AssistiveTouch — draggable floating shortcut button. */}
      <AssistiveTouch navigationRef={navigationRef} />

      {/* iOS-style notification banner — renders ABOVE everything */}
      <NotificationBanner
        notification={banner}
        onDismiss={() => setBanner(null)}
      />
    </View>
  );
}

/** Slides the navigator down when AssistiveTouch Reachability is active. */
function ReachabilityShifter({ children }: { children: React.ReactNode }) {
  const { reachabilityActive, setReachabilityActive } = useAssistiveTouch();
  return (
    <View style={{ flex: 1, transform: [{ translateY: reachabilityActive ? 260 : 0 }] }}>
      {children}
      {reachabilityActive && (
        <Pressable
          style={{ position: 'absolute', top: -260, left: 0, right: 0, height: 260 }}
          onPress={() => setReachabilityActive(false)}
          accessibilityLabel="Exit reachability"
        />
      )}
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <ThemeProvider>
            <ContactsProvider>
              <ProfileProvider>
                <AppsProvider>
                <DeviceProvider>
                <FoldersProvider>
                <AssistiveTouchProvider>
                <ErrorBoundary>
                  <AlertProvider>
                    <AppContent />
                  </AlertProvider>
                </ErrorBoundary>
                </AssistiveTouchProvider>
                </FoldersProvider>
                </DeviceProvider>
                </AppsProvider>
              </ProfileProvider>
            </ContactsProvider>
          </ThemeProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
