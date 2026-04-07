import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, AppState, Platform, StatusBar as RNStatusBar } from 'react-native';
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
import { NotificationBanner, BannerNotification } from './src/components/NotificationBanner';
import { LockScreen } from './src/screens/LockScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';

function AppContent() {
  const { isDark } = useTheme();
  const device = useDevice();
  const navigationRef = useNavigationContainerRef();
  const [isLocked, setIsLocked] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [banner, setBanner] = useState<BannerNotification | null>(null);

  // Track last known message count to detect new messages
  const lastMsgCount = useRef(0);

  // Immersive mode — hide system bars globally so all screens benefit
  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync('hidden');
      NavigationBar.setBehaviorAsync('overlay-swipe');
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
        const contact = device.contacts.find(c => {
          const cDigits = c.phone.replace(/\D/g, '').slice(-10);
          const mDigits = (newest.address || '').replace(/\D/g, '').slice(-10);
          return cDigits === mDigits && cDigits.length > 0;
        });

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
    }, 10000);

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
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <NavigationContainer ref={navigationRef}>
        <TabNavigator />
      </NavigationContainer>

      {/* iOS-style notification banner — renders ABOVE everything */}
      <NotificationBanner
        notification={banner}
        onDismiss={() => setBanner(null)}
      />
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
                <ErrorBoundary>
                  <AppContent />
                </ErrorBoundary>
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
