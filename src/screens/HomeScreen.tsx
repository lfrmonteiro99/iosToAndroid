import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { useSettings } from '../store/SettingsStore';
import { useContacts } from '../store/ContactsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
} from '../components';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function getRelativeTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const QUICK_ACTIONS = [
  { icon: 'camera' as const, label: 'Camera', color: '#FF9500', bg: '#FFF3E0', action: 'camera' },
  { icon: 'image' as const, label: 'Photos', color: '#AF52DE', bg: '#F3E5F5', action: 'wallpaper' },
  { icon: 'musical-notes' as const, label: 'Music', color: '#FF2D55', bg: '#FCE4EC', action: 'music' },
  { icon: 'document-text' as const, label: 'Files', color: '#007AFF', bg: '#E3F2FD', action: 'storage' },
];

export function HomeScreen() {
  const { theme, typography, spacing, borderRadius, shadows } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { settings } = useSettings();
  const { contacts } = useContacts();
  const [greeting, setGreeting] = useState(getGreeting());

  useEffect(() => {
    const interval = setInterval(() => setGreeting(getGreeting()), 60000);
    return () => clearInterval(interval);
  }, []);

  const batteryLevel = settings.lowPowerMode ? '48%' : '72%';
  const wifiStatus = settings.wifiEnabled ? settings.wifiNetwork : 'Off';

  const recentActivity = [
    { title: 'Contacts synced', subtitle: `${contacts.length} contacts`, icon: 'people' as const, time: getRelativeTime(2) },
    { title: 'Wi-Fi connected', subtitle: wifiStatus, icon: 'wifi' as const, time: getRelativeTime(15) },
    { title: 'Backup complete', subtitle: '4.2 GB backed up', icon: 'checkmark-circle' as const, time: getRelativeTime(60) },
    { title: settings.focusMode !== 'off' ? 'Focus mode active' : 'Focus mode off', subtitle: settings.focusMode !== 'off' ? settings.focusMode : 'No focus mode set', icon: 'moon' as const, time: getRelativeTime(120) },
  ];

  const handleQuickAction = (action: string) => {
    const settingsTab = navigation.getParent();
    switch (action) {
      case 'wallpaper':
        settingsTab?.navigate('Settings', { screen: 'Wallpaper' });
        break;
      case 'storage':
        settingsTab?.navigate('Settings', { screen: 'Storage' });
        break;
      default:
        Alert.alert('Not Available', `${action.charAt(0).toUpperCase() + action.slice(1)} is not available in this demo.`);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar title="Home" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
          <LinearGradient
            colors={theme.dark ? ['#1a1a2e', '#16213e'] : ['#667eea', '#764ba2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.greetingCard, { borderRadius: borderRadius.large }]}
          >
            <Text style={[typography.title2, { color: '#FFFFFF' }]}>
              {greeting}
            </Text>
            <Text style={[typography.body, { color: 'rgba(255,255,255,0.8)', marginTop: 4 }]}>
              {settings.airplaneMode ? 'Airplane mode is on.' : 'Everything is running smoothly today.'}
            </Text>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={[typography.title1, { color: '#FFFFFF' }]}>{batteryLevel}</Text>
                <Text style={[typography.caption1, { color: 'rgba(255,255,255,0.7)' }]}>Battery</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[typography.title1, { color: '#FFFFFF' }]}>{contacts.length}</Text>
                <Text style={[typography.caption1, { color: 'rgba(255,255,255,0.7)' }]}>Contacts</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[typography.title1, { color: '#FFFFFF' }]}>{wifiStatus}</Text>
                <Text style={[typography.caption1, { color: 'rgba(255,255,255,0.7)' }]}>Wi-Fi</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
          <Text
            style={[
              typography.footnote,
              { color: colors.secondaryLabel, marginBottom: 6, textTransform: 'uppercase' },
            ]}
          >
            Quick Actions
          </Text>
          <View style={styles.quickActionsGrid}>
            {QUICK_ACTIONS.map((action) => (
              <Pressable
                key={action.label}
                onPress={() => handleQuickAction(action.action)}
                style={[
                  styles.quickAction,
                  shadows.small,
                  {
                    backgroundColor: theme.dark
                      ? colors.secondarySystemBackground
                      : colors.systemBackground,
                    borderRadius: borderRadius.medium,
                  },
                ]}
              >
                <View
                  style={[
                    styles.quickActionIcon,
                    {
                      backgroundColor: theme.dark ? colors.systemGray5 : action.bg,
                      borderRadius: borderRadius.small,
                    },
                  ]}
                >
                  <Ionicons name={action.icon} size={24} color={action.color} />
                </View>
                <Text
                  style={[
                    typography.caption1,
                    { color: colors.label, marginTop: 8, fontWeight: '500' },
                  ]}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Recent Activity">
            {recentActivity.map((item) => (
              <CupertinoListTile
                key={item.title}
                title={item.title}
                subtitle={item.subtitle}
                leading={{
                  name: item.icon,
                  color: '#FFFFFF',
                  backgroundColor: colors.systemBlue,
                }}
                trailing={
                  <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>
                    {item.time}
                  </Text>
                }
                showChevron={false}
              />
            ))}
          </CupertinoListSection>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  greetingCard: { padding: 20 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
  stat: { alignItems: 'center' },
  quickActionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    marginHorizontal: 4,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
