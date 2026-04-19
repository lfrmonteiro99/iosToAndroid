import React, { useState, useEffect, useRef } from 'react';
import { View, AppState, Platform, Pressable, StatusBar as RNStatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { SettingsProvider } from './src/store/SettingsStore';
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
import { AssistiveTouch } from './src/components/AssistiveTouch';
import { AssistiveTouchProvider, useAssistiveTouch } from './src/store/AssistiveTouchStore';
import { LockScreen } from './src/screens/LockScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { findContactByPhone } from './src/utils/contacts';
import { onBridgeError } from './modules/launcher-module/src';

function AppContent() {
  const { isDark } = useTheme();
  const device = useDevice();
  const navigationRef = useNavigationContainerRef();
  const [isLocked, setIsLocked] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [banner, setBanner] = useState<BannerNotification | null>(null);

  // Track last known message count to detect new messages
  const lastMsgCount = useRef(0);

  // IDs of native notifications we've already surfaced as banners — prevents
  // re-showing the same notification on every poll cycle.
  const seenNotifIds = useRef<Set<string>>(new Set());

  // Pending auto-lock timer. We don't lock the instant the app goes to
  // background — a permission dialog, the system HOME intent fired by our
  // own AssistiveTouch/HomeIndicator, or any other transient focus loss all
  // background the activity for a fraction of a second. Only lock if we're
  // still backgrounded after a short grace period.
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const AUTO_LOCK_GRACE_MS = 5000;

  // Surface native bridge errors as notification banners
  useEffect(() => {
    const unsub = onBridgeError((method, error) => {
      const msg = error instanceof Error ? error.message : String(error);
      // Only show banners for user-facing operations
      if (['makeCall', 'sendSms', 'requestAllPermissions'].includes(method)) {
        setBanner({
          id: `error-${Date.now()}`,
          appName: 'System',
          iconName: 'warning-outline',
          iconColor: '#FF9500',
          title: `${method} failed`,
          body: msg || 'An error occurred. Please try again.',
        });
      }
    });
    return unsub;
  }, []);

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
        if (lockTimer.current) clearTimeout(lockTimer.current);
        lockTimer.current = setTimeout(() => {
          setIsLocked(true);
          lockTimer.current = null;
        }, AUTO_LOCK_GRACE_MS);
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
  }, []);

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

  // Also monitor native notifications
  useEffect(() => {
    if (!device.isReady || isLocked) return;
    if (Platform.OS !== 'android') return;

    const interval = setInterval(async () => {
      try {
        const mod = (await import('./modules/launcher-module/src')).default;
        const access = await mod.isNotificationAccessGranted();
        if (!access) return;
        const notifs = await mod.getNotifications();
        // Only surface the newest notification we haven't banner'd before.
        // Otherwise every poll would re-notify the same list.
        const unseen = notifs.find(
          (n) => !seenNotifIds.current.has(n.id) && (n.title || n.text),
        );
        // Mark every currently-present id as seen so dismissals don't cause
        // the same notification to re-fire on the next poll.
        for (const n of notifs) seenNotifIds.current.add(n.id);
        if (unseen) {
          setBanner({
            id: `notif-${unseen.id}`,
            appName: unseen.packageName.split('.').pop() || 'App',
            iconName: 'notifications',
            iconColor: '#5856D6',
            title: unseen.title,
            body: unseen.text,
          });
        }
      } catch { /* ignore */ }
    }, 30000);

    return () => clearInterval(interval);
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
        <NavigationContainer ref={navigationRef}>
          <TabNavigator />
        </NavigationContainer>
      </ReachabilityShifter>

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
