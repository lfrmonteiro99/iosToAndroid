import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeContext';
import { useDevice } from '../../store/DeviceStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  useAlert,
} from '../../components';
import type { AppNavigationProp } from '../../navigation/types';

const CACHE_KEYS = [
  'calculator_history',
  '@iostoandroid/maps_recents',
  '@iostoandroid/recent_apps',
];

const getLauncher = async () => {
  try { return (await import('../../../modules/launcher-module/src')).default; }
  catch { return null; }
};

interface AppStorageStat {
  packageName: string;
  appName: string;
  totalBytes: number;
  cacheBytes: number;
}

// Storage category colors (iOS-style)
const CATEGORY_COLORS = {
  apps: '#007AFF',     // Blue
  photos: '#FFCC00',   // Yellow
  messages: '#34C759', // Green
  system: '#8E8E93',   // Gray
  other: '#FF9500',    // Orange
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function StorageScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { storage } = useDevice();

  const [appStats, setAppStats] = useState<AppStorageStat[]>([]);
  const alert = useAlert();

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    (async () => {
      try {
        const mod = await getLauncher();
        if (!mod) return;
        const stats = await mod.getAppStorageStats();
        setAppStats(stats);
      } catch { /* ignore */ }
    })();
  }, []);

  const totalUsedBytes = storage.usedPercentage > 0
    ? (parseFloat(storage.usedGB) * 1073741824)
    : 0;

  // Estimate category breakdowns from app stats
  const totalAppBytes = appStats.reduce((sum, a) => sum + a.totalBytes, 0);
  const estimatedSystemBytes = totalUsedBytes * 0.15; // ~15% system
  const estimatedPhotosBytes = totalUsedBytes * 0.10;  // ~10% photos estimate
  const estimatedMessagesBytes = totalUsedBytes * 0.05; // ~5% messages estimate
  const estimatedOtherBytes = Math.max(0, totalUsedBytes - totalAppBytes - estimatedSystemBytes - estimatedPhotosBytes - estimatedMessagesBytes);

  const totalBytes = parseFloat(storage.totalGB) * 1073741824 || 1;

  const categories = [
    { label: 'Apps', color: CATEGORY_COLORS.apps, bytes: totalAppBytes, fraction: totalAppBytes / totalBytes },
    { label: 'Photos & Media', color: CATEGORY_COLORS.photos, bytes: estimatedPhotosBytes, fraction: estimatedPhotosBytes / totalBytes },
    { label: 'Messages', color: CATEGORY_COLORS.messages, bytes: estimatedMessagesBytes, fraction: estimatedMessagesBytes / totalBytes },
    { label: 'System', color: CATEGORY_COLORS.system, bytes: estimatedSystemBytes, fraction: estimatedSystemBytes / totalBytes },
    { label: 'Other', color: CATEGORY_COLORS.other, bytes: estimatedOtherBytes, fraction: estimatedOtherBytes / totalBytes },
  ];

  const freeFraction = Math.max(0, 1 - categories.reduce((sum, c) => sum + c.fraction, 0));

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Device Storage"
        largeTitle={false}
        leftButton={
          <Text
            style={[typography.body, { color: colors.systemBlue }]}
            onPress={() => navigation.goBack()}
          >
            General
          </Text>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Color-coded storage bar */}
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
          <View style={styles.storageBarRow}>
            {categories.map((cat) => (
              cat.fraction > 0.005 ? (
                <View
                  key={cat.label}
                  style={{
                    flex: cat.fraction,
                    height: 24,
                    backgroundColor: cat.color,
                  }}
                />
              ) : null
            ))}
            <View
              style={{
                flex: freeFraction > 0 ? freeFraction : 0.001,
                height: 24,
                backgroundColor: colors.systemGray5,
              }}
            />
          </View>

          <Text style={[typography.footnote, { color: colors.secondaryLabel, marginTop: spacing.sm }]}>
            {storage.usedGB} GB of {storage.totalGB} GB Used
          </Text>
        </View>

        {/* Category breakdown */}
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection header="Categories">
            {categories.map((cat) => (
              <CupertinoListTile
                key={cat.label}
                title={cat.label}
                trailing={
                  <View style={styles.trailingRow}>
                    <View style={[styles.dot, { backgroundColor: cat.color }]} />
                    <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                      {formatBytes(cat.bytes)}
                    </Text>
                  </View>
                }
                showChevron={false}
              />
            ))}
            <CupertinoListTile
              title="Available"
              trailing={
                <View style={styles.trailingRow}>
                  <View style={[styles.dot, { backgroundColor: colors.systemGray5 }]} />
                  <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                    {storage.freeGB} GB
                  </Text>
                </View>
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Top Apps by Storage */}
        {appStats.length > 0 && (
          <View style={{ paddingHorizontal: spacing.md }}>
            <CupertinoListSection header="Top Apps by Size">
              {appStats.slice(0, 10).map((app, index) => (
                <CupertinoListTile
                  key={app.packageName}
                  title={app.appName}
                  subtitle={app.cacheBytes > 0 ? `Cache: ${formatBytes(app.cacheBytes)}` : undefined}
                  trailing={
                    <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                      {formatBytes(app.totalBytes)}
                    </Text>
                  }
                  leading={{
                    name: index === 0 ? 'apps' : 'cube-outline',
                    color: '#FFFFFF',
                    backgroundColor: CATEGORY_COLORS.apps,
                  }}
                  showChevron={false}
                />
              ))}
            </CupertinoListSection>
          </View>
        )}

        {/* Clear App Cache */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            header="Manage Storage"
            footer="Clears app history and recents. Your personal data is not affected."
          >
            <CupertinoListTile
              title="Clear App Cache"
              leading={{
                name: 'trash-outline',
                color: '#FFFFFF',
                backgroundColor: colors.systemRed,
              }}
              showChevron
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                alert(
                  'Clear App Cache',
                  'Clear app cache? This will reset app preferences but not your personal data.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Clear',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await AsyncStorage.removeMany(CACHE_KEYS);
                          alert('Cache Cleared', 'App cache has been cleared successfully.');
                        } catch {
                          alert('Error', 'Could not clear cache. Please try again.');
                        }
                      },
                    },
                  ]
                );
              }}
            />
          </CupertinoListSection>
        </View>

        {/* Offload Unused Apps */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Recommendations">
            <CupertinoListTile
              title="Offload Unused Apps"
              subtitle="Automatically remove unused apps while keeping their data. Reinstalling restores your data."
              leading={{
                name: 'cloud-download-outline',
                color: '#FFFFFF',
                backgroundColor: colors.systemGreen,
              }}
              showChevron={false}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            />
          </CupertinoListSection>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  storageBarRow: {
    flexDirection: 'row',
    height: 24,
    borderRadius: 6,
    overflow: 'hidden',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  trailingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
