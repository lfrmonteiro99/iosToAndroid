import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { useApps } from '../store/AppsStore';
import { useTheme } from '../theme/ThemeContext';
import { CupertinoSwipeableRow } from '../components/CupertinoSwipeableRow';
import { useAlert } from '../components';

const getLauncher = async () => {
  try {
    return (await import('../../modules/launcher-module/src')).default;
  } catch {
    return null;
  }
};

interface DeviceNotification {
  id: string;
  key: string;
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

const COLLAPSED_LIMIT = 3;

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
  const { theme, typography } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { apps, launchApp } = useApps();
  const alert = useAlert();

  const [notifications, setNotifications] = useState<DeviceNotification[]>([]);
  const [hasAccess, setHasAccess] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [expandedNotifKey, setExpandedNotifKey] = useState<string | null>(null);
  const [replyingKey, setReplyingKey] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const replyInputRef = useRef<TextInput>(null);

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

  const handleClearAll = useCallback(async () => {
    const mod = await getLauncher();
    if (mod) {
      await mod.clearAllNotifications();
    }
    setNotifications([]);
    setExpandedGroups(new Set());
  }, []);

  const handleDismissNotification = useCallback(async (notif: DeviceNotification) => {
    const mod = await getLauncher();
    if (mod) {
      await mod.clearNotification(notif.key);
    }
    setNotifications(prev => prev.filter(n => n.key !== notif.key));
  }, []);

  const handleDismiss = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleNotificationTap = useCallback((notif: DeviceNotification) => {
    setReadIds(prev => new Set(prev).add(notif.key));
    launchApp(notif.packageName);
    navigation.goBack();
  }, [launchApp, navigation]);

  const handleMarkAsRead = useCallback((notif: DeviceNotification) => {
    setReadIds(prev => new Set(prev).add(notif.key));
  }, []);

  const handleLongPress = useCallback((notif: DeviceNotification) => {
    alert(
      notif.title || 'Notification',
      undefined,
      [
        {
          text: 'Open App',
          onPress: () => handleNotificationTap(notif),
        },
        {
          text: 'Dismiss',
          onPress: () => handleDismissNotification(notif),
          style: 'destructive',
        },
        {
          text: 'Mark as Read',
          onPress: () => handleMarkAsRead(notif),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
    );
  }, [alert, handleNotificationTap, handleDismissNotification, handleMarkAsRead]);

  const toggleGroupExpanded = useCallback((packageName: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(packageName)) {
        next.delete(packageName);
      } else {
        next.add(packageName);
      }
      return next;
    });
  }, []);

  const handleNotifCardTap = useCallback((notif: DeviceNotification) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedNotifKey(prev => prev === notif.key ? null : notif.key);
    // Also mark as read
    setReadIds(prev => new Set(prev).add(notif.key));
  }, []);

  const handleStartReply = useCallback((notif: DeviceNotification) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setReplyingKey(notif.key);
    setReplyText('');
    setTimeout(() => replyInputRef.current?.focus(), 100);
  }, []);

  const handleSendReply = useCallback((notif: DeviceNotification) => {
    if (!replyText.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // In real impl this would send via notification reply; here we just dismiss
    setReplyingKey(null);
    setReplyText('');
    handleDismissNotification(notif);
  }, [replyText, handleDismissNotification]);

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
            <Pressable onPress={handleClearAll} hitSlop={12} accessibilityLabel="Clear all notifications" accessibilityRole="button">
              <Text style={[styles.clearAllText, typography.subhead, { fontWeight: '600', color: colors.accent }]}>Clear All</Text>
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
            <Pressable style={[styles.accessButton, { backgroundColor: colors.accent }]} onPress={handleEnableAccess} accessibilityLabel="Enable Notification Access" accessibilityRole="button">
              <Text style={[styles.accessButtonText, typography.subhead, { fontWeight: '600' }]}>Enable Notification Access</Text>
            </Pressable>
          </BlurView>
        )}

        {/* Notification list */}
        {hasAccess && (
          <KeyboardAvoidingView
            style={styles.flex1}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            decelerationRate={0.998}
          >
            {groups.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="notifications" size={48} color="rgba(255,255,255,0.4)" />
                <Text style={[styles.emptyText, typography.subhead, { fontWeight: '500' }]}>No Notifications</Text>
              </View>
            ) : (
              groups.map(group => {
                const isExpanded = expandedGroups.has(group.packageName);
                const totalCount = group.notifications.length;
                const visibleNotifs = totalCount > COLLAPSED_LIMIT && !isExpanded
                  ? group.notifications.slice(0, COLLAPSED_LIMIT)
                  : group.notifications;
                const hiddenCount = totalCount - COLLAPSED_LIMIT;

                return (
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
                    {visibleNotifs.map(notif => {
                      const isRead = readIds.has(notif.key);
                      const isExpanded = expandedNotifKey === notif.key;
                      const isReplying = replyingKey === notif.key;
                      const isMessageApp = notif.packageName.includes('message') || notif.packageName.includes('sms') || notif.packageName.includes('whatsapp') || notif.packageName.includes('telegram') || notif.packageName.includes('signal');
                      return (
                        <CupertinoSwipeableRow
                          key={notif.key}
                          trailingActions={[
                            {
                              label: 'Dismiss',
                              color: '#FF3B30',
                              onPress: () => handleDismissNotification(notif),
                            },
                            {
                              label: 'Mark Read',
                              color: '#636366',
                              onPress: () => handleMarkAsRead(notif),
                            },
                          ]}
                        >
                          <Pressable
                            onPress={() => handleNotifCardTap(notif)}
                            onLongPress={() => handleLongPress(notif)}
                            style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
                            accessibilityLabel={`${notif.title || group.appName} notification from ${group.appName}`}
                            accessibilityRole="button"
                          >
                            <BlurView intensity={50} tint="dark" experimentalBlurMethod="dimezisBlurView" style={styles.notifCard}>
                              <View style={styles.notifCardHeader}>
                                <View style={styles.notifTitleRow}>
                                  {!isRead && <View style={styles.unreadDot} />}
                                  <Text
                                    style={[
                                      styles.notifTitle,
                                      typography.subhead,
                                      { fontWeight: '700' },
                                      isRead && styles.notifTitleRead,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {notif.title || group.appName}
                                  </Text>
                                </View>
                                <Text style={[styles.notifTime, typography.caption1]}>
                                  {formatNotifTime(notif.time)}
                                </Text>
                              </View>
                              {!!notif.text && (
                                <Text
                                  style={[
                                    styles.notifBody,
                                    typography.footnote,
                                    isRead && styles.notifBodyRead,
                                  ]}
                                  numberOfLines={isExpanded ? undefined : 2}
                                >
                                  {notif.text}
                                </Text>
                              )}
                              {/* Expanded action buttons */}
                              {isExpanded && !isReplying && (
                                <View style={styles.notifActions}>
                                  <Pressable
                                    style={styles.notifActionBtn}
                                    onPress={() => { handleNotificationTap(notif); }}
                                    accessibilityLabel="Open app"
                                    accessibilityRole="button"
                                  >
                                    <Text style={styles.notifActionText}>Open</Text>
                                  </Pressable>
                                  {isMessageApp && (
                                    <Pressable
                                      style={[styles.notifActionBtn, styles.notifActionBtnPrimary]}
                                      onPress={() => handleStartReply(notif)}
                                      accessibilityLabel="Reply"
                                      accessibilityRole="button"
                                    >
                                      <Text style={[styles.notifActionText, { color: '#0A84FF' }]}>Reply</Text>
                                    </Pressable>
                                  )}
                                  <Pressable
                                    style={[styles.notifActionBtn, styles.notifActionBtnDestructive]}
                                    onPress={() => { handleDismissNotification(notif); }}
                                    accessibilityLabel="Dismiss"
                                    accessibilityRole="button"
                                  >
                                    <Text style={[styles.notifActionText, { color: '#FF453A' }]}>Dismiss</Text>
                                  </Pressable>
                                </View>
                              )}
                              {/* Inline reply input */}
                              {isReplying && (
                                <View style={styles.replyContainer}>
                                  <TextInput
                                    ref={replyInputRef}
                                    style={styles.replyInput}
                                    placeholder="Reply..."
                                    placeholderTextColor="rgba(255,255,255,0.35)"
                                    value={replyText}
                                    onChangeText={setReplyText}
                                    returnKeyType="send"
                                    onSubmitEditing={() => handleSendReply(notif)}
                                    multiline
                                  />
                                  <View style={styles.replyButtonRow}>
                                    <Pressable
                                      style={styles.replyCancelBtn}
                                      onPress={() => { setReplyingKey(null); setReplyText(''); }}
                                    >
                                      <Text style={styles.replyCancelText}>Cancel</Text>
                                    </Pressable>
                                    <Pressable
                                      style={styles.replySendBtn}
                                      onPress={() => handleSendReply(notif)}
                                    >
                                      <Ionicons name="arrow-up-circle" size={28} color="#0A84FF" />
                                    </Pressable>
                                  </View>
                                </View>
                              )}
                            </BlurView>
                          </Pressable>
                        </CupertinoSwipeableRow>
                      );
                    })}

                    {/* Show More / Show Less button */}
                    {totalCount > COLLAPSED_LIMIT && (
                      <Pressable
                        onPress={() => toggleGroupExpanded(group.packageName)}
                        style={styles.showMoreButton}
                        hitSlop={8}
                        accessibilityLabel={isExpanded ? `Show fewer ${group.appName} notifications` : `Show more ${group.appName} notifications`}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.showMoreText, typography.footnote, { fontWeight: '600' }]}>
                          {isExpanded ? 'Show Less' : `Show More (${hiddenCount})`}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
          </KeyboardAvoidingView>
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
  },
  flex1: {
    flex: 1,
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
  notifTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0A84FF',
    marginRight: 6,
  },
  notifTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  notifTitleRead: {
    color: 'rgba(255,255,255,0.6)',
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
  notifBodyRead: {
    color: 'rgba(255,255,255,0.45)',
  },
  showMoreButton: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  showMoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0A84FF',
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
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  accessButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  // Per-notification action buttons (shown on tap-expand)
  notifActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  notifActionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  notifActionBtnPrimary: {
    backgroundColor: 'rgba(10,132,255,0.15)',
  },
  notifActionBtnDestructive: {
    backgroundColor: 'rgba(255,69,58,0.12)',
  },
  notifActionText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '600',
  },
  // Inline reply
  replyContainer: {
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: 8,
  },
  replyInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#FFFFFF',
    fontSize: 14,
    minHeight: 36,
    maxHeight: 80,
  },
  replyButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 6,
    gap: 12,
  },
  replyCancelBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  replyCancelText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '500',
  },
  replySendBtn: {
    padding: 2,
  },
});
