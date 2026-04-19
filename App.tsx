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
        setIsLocked(true);
      } else if (state === 'active' && Platform.OS === 'android') {
        // Re-assert immersive mode — Android can restore system bars on resume
        NavigationBar.setVisibilityAsync('hidden');
        RNStatusBar.setHidden(true, 'slide');
      }
    });
    return () => sub.remove();
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
        if (notifs.length > 0) {
          const latest = notifs[0];
          // Don't re-show if same notification
          if (banner?.id === `notif-${latest.id}`) return;
          if (latest.title || latest.text) {
            setBanner({
              id: `notif-${latest.id}`,
              appName: latest.packageName.split('.').pop() || 'App',
              iconName: 'notifications',
              iconColor: '#5856D6',
              title: latest.title,
              body: latest.text,
            });
          }
        }
      } catch { /* ignore */ }
    }, 30000);

    return () => clearInterval(interval);
  }, [device.isReady, isLocked, banner?.id]);

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
