import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../theme/ThemeContext';
import { useHealth } from '../store/HealthStore';
import {
  aggregateDaily,
  aggregateWeekly,
  aggregateMonthly,
} from '../utils/healthAggregation';
import {
  CupertinoNavigationBar,
  CupertinoCard,
  CupertinoButton,
  CupertinoSegmentedControl,
  CupertinoBarChart,
  BackEdgeSwipe,
} from '../components';
import type { AppNavigationProp } from '../navigation/types';

const TREND_GRANULARITIES = ['Daily', 'Weekly', 'Monthly'] as const;
type Granularity = (typeof TREND_GRANULARITIES)[number];

/**
 * Minimal Health slice (#271): today's step count from the device pedometer and
 * nothing else. No mock data — before permission is granted (or when the device
 * has no step-counter at all) the count reads `—`, never an invented number.
 *
 * The Trends section (#276) reads the same persisted history the store keeps and
 * feeds it through the real aggregation helpers — bucketing is never re-implemented here.
 */
export function HealthScreen() {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<AppNavigationProp>();
  const {
    todaySteps,
    isPedometerAvailable,
    permissionGranted,
    requestActivityPermission,
    isReady,
    stepHistory,
    isHealthConnectAvailable,
    syncFromHealthConnect,
  } = useHealth();

  const [granularity, setGranularity] = useState<Granularity>('Daily');
  const [syncing, setSyncing] = useState(false);

  const showSteps = permissionGranted === true;
  const needsPermission = isReady && isPedometerAvailable && permissionGranted !== true;
  const sensorMissing = isReady && !isPedometerAvailable;

  const handleGrant = useCallback(() => {
    void requestActivityPermission();
  }, [requestActivityPermission]);

  const handleSync = useCallback(() => {
    // Guard the button itself too: on the common (unavailable) path it is never
    // rendered, but if it ever is, calling sync on an absent module is a safe
    // no-op that returns false — never a throw.
    if (!isHealthConnectAvailable) return;
    setSyncing(true);
    void syncFromHealthConnect()
      .catch(() => false)
      .finally(() => setSyncing(false));
  }, [isHealthConnectAvailable, syncFromHealthConnect]);

  const chartData = (() => {
    switch (granularity) {
      case 'Weekly':
        return aggregateWeekly(stepHistory).map((b) => ({ label: b.label, value: b.totalSteps }));
      case 'Monthly':
        return aggregateMonthly(stepHistory).map((b) => ({ label: b.label, value: b.totalSteps }));
      case 'Daily':
      default:
        return aggregateDaily(stepHistory).map((b) => ({ label: b.label, value: b.totalSteps }));
    }
  })();

  return (
    <BackEdgeSwipe>
      <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        <CupertinoNavigationBar
          title="Health"
          largeTitle={false}
          leftButton={
            <Pressable
              onPress={() => navigation.goBack()}
              style={{ flexDirection: 'row', alignItems: 'center' }}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <Ionicons name="chevron-back" size={28} color={colors.systemBlue} />
            </Pressable>
          }
        />

        <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 90 }}>
          <CupertinoCard title="Steps" subtitle="Today">
            <View style={styles.stepsRow}>
              <Ionicons name="footsteps" size={26} color="#FF2D55" />
              <Text
                style={[typography.largeTitle, { color: colors.label, marginLeft: spacing.sm }]}
                accessibilityLabel="Today's step count"
              >
                {showSteps ? String(todaySteps) : '—'}
              </Text>
            </View>

            {sensorMissing ? (
              <Text style={[typography.footnote, { color: colors.secondaryLabel, marginTop: spacing.sm }]}>
                Step counting is not available on this device
              </Text>
            ) : null}

            {needsPermission ? (
              <View style={{ marginTop: spacing.md }}>
                <CupertinoButton title="Grant Activity Permission" variant="filled" onPress={handleGrant} />
              </View>
            ) : null}

            {isHealthConnectAvailable ? (
              <View style={{ marginTop: spacing.md }}>
                <CupertinoButton
                  title="Sync with Health Connect"
                  variant="filled"
                  onPress={handleSync}
                  disabled={syncing}
                />
              </View>
            ) : null}
          </CupertinoCard>

          <CupertinoCard title="Trends" subtitle="Step history">
            <View style={{ marginBottom: spacing.sm }}>
              <CupertinoSegmentedControl
                values={[...TREND_GRANULARITIES]}
                selectedIndex={TREND_GRANULARITIES.indexOf(granularity)}
                onChange={(index: number) => setGranularity(TREND_GRANULARITIES[index])}
              />
            </View>
            <CupertinoBarChart data={chartData} />
          </CupertinoCard>
        </ScrollView>
      </View>
    </BackEdgeSwipe>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  stepsRow: { flexDirection: 'row', alignItems: 'center' },
});
