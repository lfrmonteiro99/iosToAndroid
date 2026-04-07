import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  Pressable,
  StyleSheet,
  Dimensions,
  Image,
  Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useApps } from '../store/AppsStore';
import { useTheme } from '../theme/ThemeContext';

const READ_IDS_KEY = '@notification_read_ids';

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
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const d = new Date(timestamp);
  if (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  ) {
    return 'Yesterday';
  }
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
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  // Load read IDs from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(READ_IDS_KEY);
        if (stored) setReadIds(new Set(JSON.parse(stored)));
      } catch {
        console.log("erro");
      }
    })();
  }, []);

  const persistReadIds = useCallback(async (ids: Set<string>) => {
    try {
      await AsyncStorage.setItem(READ_IDS_KEY, JSON.stringify([...ids]));
    } catch {
      console.log("erro");
    }
  }, []);

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
    Alert.alert(
      'Clear All Notifications?',
      'This will remove all notifications from the list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setNotifications([]);
            setReadIds(new Set());
            await AsyncStorage.removeItem(READ_IDS_KEY);
          },
        },
      ],
    );
  }, []);

  const handleDismiss = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleNotificationTap = useCallback((notifId: string, packageName: string) => {
    setReadIds(prev => {
      const next = new Set(prev);
      next.add(notifId);
      persistReadIds(next);
      return next;
    });
    launchApp(packageName);
    navigation.goBack();
  }, [launchApp, navigation, persistReadIds]);

  // Group notifications by packageName, sorted by most recent
  const sections = React.useMemo(() => {
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
    const groups = Array.from(map.values());
    // Sort sections by most recent notification timestamp (descending)
    groups.sort((a, b) => {
      const aMax = Math.max(...a.notifications.map(n => n.time));
      const bMax = Math.max(...b.notifications.map(n => n.time));
      return bMax - aMax;
    });
    return groups.map(group => ({
      title: group.appName,
      appIcon: group.appIcon,
      packageName: group.packageName,
      data: group.notifications,
    }));
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
          <BlurView intensity={40} tint="dark" experimentalBlurMethod="dimezisBlurView" style={styles.accessCard}>
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
          sections.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="notifications" size={48} color="rgba(255,255,255,0.4)" />
              <Text style={[styles.emptyText, typography.subhead, { fontWeight: '500' }]}>No Notifications</Text>
            </View>
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={item => item.id}
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) => (
                <View style={styles.groupHeader}>
                  {section.appIcon ? (
                    <Image source={{ uri: `data:image/png;base64,${section.appIcon}` }} style={styles.appIcon} />
                  ) : (
                    <View style={styles.appIconFallback}>
                      <Ionicons name="apps" size={14} color="#FFFFFF" />
                    </View>
                  )}
                  <Text style={[styles.groupAppName, typography.footnote, { fontWeight: '700' }]}>{section.title}</Text>
                </View>
              )}
              renderItem={({ item: notif, section }) => {
                const isRead = readIds.has(notif.id);
                return (
                  <Pressable
                    onPress={() => handleNotificationTap(notif.id, notif.packageName)}
                    style={({ pressed }) => [{ opacity: pressed ? 0.85 : isRead ? 0.6 : 1 }]}
                  >
                    <BlurView intensity={50} tint="dark" experimentalBlurMethod="dimezisBlurView" style={styles.notifCard}>
                      <View style={styles.notifCardHeader}>
                        <Text style={[styles.notifTitle, typography.subhead, { fontWeight: '700' }]} numberOfLines={1}>
                          {notif.title || section.title}
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
                );
              }}
              renderSectionFooter={() => <View style={{ height: 12 }} />}
            />
          )
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
