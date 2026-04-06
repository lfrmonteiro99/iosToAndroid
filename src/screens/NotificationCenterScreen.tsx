import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  Image,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { useApps } from '../store/AppsStore';
import { useTheme } from '../theme/ThemeContext';

const getLauncher = async () => {
  try {
    return (await import('../../modules/launcher-module/src')).default;
  } catch {
    return null;
  }
};

interface DeviceNotification {
  id: string;
  packageName: string;
  title: string;
  text: string;
  time: number;
  isOngoing: boolean;
}

interface NotificationGroup {
  packageName: string;
  appName: string;
  appIcon: string;
  notifications: DeviceNotification[];
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function formatNotifTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) {
    const d = new Date(timestamp);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }
  const d = new Date(timestamp);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function formatDateHeader(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

export function NotificationCenterScreen() {
  const { theme, isDark, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { apps, launchApp } = useApps();

  const [notifications, setNotifications] = useState<DeviceNotification[]>([]);
  const [hasAccess, setHasAccess] = useState(false);

  const loadNotifications = useCallback(async () => {
    const mod = await getLauncher();
    if (!mod) return;
    const access = await mod.isNotificationAccessGranted();
    setHasAccess(access);
    if (access) {
      const notifs = await mod.getNotifications();
      setNotifications(notifs);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const mod = await getLauncher();
      if (!mod || !mounted) return;
      const access = await mod.isNotificationAccessGranted();
      if (!mounted) return;
      setHasAccess(access);
      if (access) {
        const notifs = await mod.getNotifications();
        if (mounted) setNotifications(notifs);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleEnableAccess = useCallback(async () => {
    const mod = await getLauncher();
    if (!mod) return;
    await mod.openNotificationAccessSettings();
  }, []);

  const handleClearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const handleDismiss = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleNotificationTap = useCallback((packageName: string) => {
    launchApp(packageName);
    navigation.goBack();
  }, [launchApp, navigation]);

  // Group notifications by packageName
  const groups: NotificationGroup[] = React.useMemo(() => {
    const map = new Map<string, NotificationGroup>();
    for (const notif of notifications) {
      if (!map.has(notif.packageName)) {
        const appInfo = apps.find(a => a.packageName === notif.packageName);
        map.set(notif.packageName, {
          packageName: notif.packageName,
          appName: appInfo?.name ?? notif.packageName.split('.').pop() ?? notif.packageName,
          appIcon: appInfo?.icon ?? '',
          notifications: [],
        });
      }
      map.get(notif.packageName)!.notifications.push(notif);
    }
    return Array.from(map.values());
  }, [notifications, apps]);

  const today = new Date();

  return (
    <View style={styles.root}>
      {/* Tap-outside dismiss area */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />

      {/* Main panel */}
      <View style={[styles.panel, { paddingTop: insets.top + 8 }]}>
        {/* Date header row */}
        <View style={styles.headerRow}>
          <Text style={[styles.dateText, typography.title1]}>{formatDateHeader(today)}</Text>
          {notifications.length > 0 && (
            <Pressable onPress={handleClearAll} hitSlop={12}>
              <Text style={[styles.clearAllText, typography.subhead, { fontWeight: '600' }]}>Clear All</Text>
            </Pressable>
          )}
        </View>

        {/* No notification access */}
        {!hasAccess && (
          <BlurView intensity={40} tint="dark" style={styles.accessCard}>
            <Ionicons name="notifications-off" size={28} color="#FFFFFF" style={{ marginBottom: 8 }} />
            <Text style={[styles.accessTitle, typography.headline]}>Notification Access Required</Text>
            <Text style={[styles.accessSubtitle, typography.subhead]}>
              Allow access to see your notifications here.
            </Text>
            <Pressable style={styles.accessButton} onPress={handleEnableAccess}>
              <Text style={[styles.accessButtonText, typography.subhead, { fontWeight: '600' }]}>Enable Notification Access</Text>
            </Pressable>
          </BlurView>
        )}

        {/* Notification list */}
        {hasAccess && (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {groups.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="notifications" size={48} color="rgba(255,255,255,0.4)" />
                <Text style={[styles.emptyText, typography.subhead, { fontWeight: '500' }]}>No Notifications</Text>
              </View>
            ) : (
              groups.map(group => (
                <View key={group.packageName} style={styles.group}>
                  {/* App name header */}
                  <View style={styles.groupHeader}>
                    {group.appIcon ? (
                      <Image source={{ uri: `data:image/png;base64,${group.appIcon}` }} style={styles.appIcon} />
                    ) : (
                      <View style={styles.appIconFallback}>
                        <Ionicons name="apps" size={14} color="#FFFFFF" />
                      </View>
                    )}
                    <Text style={[styles.groupAppName, typography.footnote, { fontWeight: '700' }]}>{group.appName}</Text>
                  </View>

                  {/* Notification cards */}
                  {group.notifications.map(notif => (
                    <Pressable
                      key={notif.id}
                      onPress={() => handleNotificationTap(notif.packageName)}
                      style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
                    >
                      <BlurView intensity={50} tint="dark" style={styles.notifCard}>
                        <View style={styles.notifCardHeader}>
                          <Text style={[styles.notifTitle, typography.subhead, { fontWeight: '700' }]} numberOfLines={1}>
                            {notif.title || group.appName}
                          </Text>
                          <Text style={[styles.notifTime, typography.caption1]}>
                            {formatNotifTime(notif.time)}
                          </Text>
                        </View>
                        {!!notif.text && (
                          <Text style={[styles.notifBody, typography.footnote]} numberOfLines={2}>
                            {notif.text}
                          </Text>
                        )}
                      </BlurView>
                    </Pressable>
                  ))}
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  panel: {
    flex: 1,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  dateText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  clearAllText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0A84FF',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
    gap: 20,
  },
  group: {
    gap: 8,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  appIcon: {
    width: 20,
    height: 20,
    borderRadius: 5,
  },
  appIconFallback: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAppName: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notifCard: {
    borderRadius: 14,
    padding: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  notifCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  notifTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
    marginRight: 8,
  },
  notifTime: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    flexShrink: 0,
  },
  notifBody: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 19,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  accessCard: {
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 16,
  },
  accessTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
    textAlign: 'center',
  },
  accessSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  accessButton: {
    backgroundColor: '#0A84FF',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  accessButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
