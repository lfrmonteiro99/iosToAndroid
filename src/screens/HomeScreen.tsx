import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
} from '../components';

const QUICK_ACTIONS = [
  { icon: 'camera' as const, label: 'Camera', color: '#FF9500', bg: '#FFF3E0' },
  { icon: 'image' as const, label: 'Photos', color: '#AF52DE', bg: '#F3E5F5' },
  { icon: 'musical-notes' as const, label: 'Music', color: '#FF2D55', bg: '#FCE4EC' },
  { icon: 'document-text' as const, label: 'Files', color: '#007AFF', bg: '#E3F2FD' },
];

const RECENT_ACTIVITY = [
  { title: 'Photos synced', subtitle: '238 photos uploaded', icon: 'cloud-done' as const, time: '2m ago' },
  { title: 'App updated', subtitle: 'Messages v2.1', icon: 'arrow-down-circle' as const, time: '15m ago' },
  { title: 'Backup complete', subtitle: '4.2 GB backed up', icon: 'checkmark-circle' as const, time: '1h ago' },
  { title: 'New login detected', subtitle: 'MacBook Pro - Chrome', icon: 'shield-checkmark' as const, time: '3h ago' },
];

export function HomeScreen() {
  const { theme, typography, spacing, borderRadius, shadows } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar title="Home" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting Card */}
        <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
          <LinearGradient
            colors={theme.dark ? ['#1a1a2e', '#16213e'] : ['#667eea', '#764ba2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.greetingCard, { borderRadius: borderRadius.large }]}
          >
            <Text style={[typography.title2, { color: '#FFFFFF' }]}>
              Good Morning
            </Text>
            <Text style={[typography.body, { color: 'rgba(255,255,255,0.8)', marginTop: 4 }]}>
              Everything is running smoothly today.
            </Text>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={[typography.title1, { color: '#FFFFFF' }]}>98%</Text>
                <Text style={[typography.caption1, { color: 'rgba(255,255,255,0.7)' }]}>
                  Storage
                </Text>
              </View>
              <View style={styles.stat}>
                <Text style={[typography.title1, { color: '#FFFFFF' }]}>12</Text>
                <Text style={[typography.caption1, { color: 'rgba(255,255,255,0.7)' }]}>
                  Apps
                </Text>
              </View>
              <View style={styles.stat}>
                <Text style={[typography.title1, { color: '#FFFFFF' }]}>5h</Text>
                <Text style={[typography.caption1, { color: 'rgba(255,255,255,0.7)' }]}>
                  Screen Time
                </Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Quick Actions */}
        <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
          <Text
            style={[
              typography.footnote,
              { color: colors.secondaryLabel, marginBottom: 6, paddingHorizontal: 0, textTransform: 'uppercase' },
            ]}
          >
            Quick Actions
          </Text>
          <View style={styles.quickActionsGrid}>
            {QUICK_ACTIONS.map((action) => (
              <View
                key={action.label}
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
              </View>
            ))}
          </View>
        </View>

        {/* Recent Activity */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Recent Activity">
            {RECENT_ACTIVITY.map((item) => (
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
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  greetingCard: {
    padding: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
  stat: {
    alignItems: 'center',
  },
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
