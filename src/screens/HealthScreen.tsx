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
  CupertinoListSection,
  CupertinoListTile,
  CupertinoEmptyState,
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
 *
 * #275 adds a `Browse` tab listing health categories. Activity is the only one
 * with a real data source; the other four render an honest empty state instead
 * of invented numbers (the epic explicitly forbids fake data).
 *
 * #277 (this issue) adds an availability-gated, read-only Health Connect sync.
 * The "Sync with Health Connect" button appears ONLY when Health Connect is
 * reported available; when it is absent (the common case on most devices and
 * emulators) the screen behaves exactly as it did before — no extra UI.
 */

const HEALTH_CATEGORIES = [
  { key: 'activity', title: 'Activity', icon: 'walk' as const, color: '#FF3B30' },
  { key: 'body', title: 'Body Measurements', icon: 'body' as const, color: '#FF9500' },
  { key: 'heart', title: 'Heart', icon: 'heart' as const, color: '#FF2D55' },
  { key: 'sleep', title: 'Sleep', icon: 'moon' as const, color: '#5856D6' },
  { key: 'nutrition', title: 'Nutrition', icon: 'nutrition' as const, color: '#34C759' },
] as const;

type CategoryKey = (typeof HEALTH_CATEGORIES)[number]['key'];

// Factual statements of what would populate each category once a source exists.
// No ETA, no promise — just current fact.
const EMPTY_MESSAGES: Record<Exclude<CategoryKey, 'activity'>, string> = {
  body: 'Body measurements sync from Health Connect once it’s connected.',
  heart: 'Heart rate and other heart metrics will appear here once they’re available.',
  sleep: 'Sleep analysis will appear here once it’s available.',
  nutrition: 'Nutrition data will appear here once it’s available.',
};

export function HealthScreen() {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<AppNavigationProp>();
  const {
    todaySteps,
    todayDistanceKm,
    todayActiveEnergyKcal,
    isPedometerAvailable,
    permissionGranted,
    requestActivityPermission,
    isReady,
    stepHistory,
    isHealthConnectAvailable,
    syncFromHealthConnect,
  } = useHealth();

  const [segment, setSegment] = useState(0); // 0 = Summary, 1 = Browse
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(null);
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

  const handleBack = useCallback(() => {
    if (selectedCategory) {
      setSelectedCategory(null);
    } else {
      navigation.goBack();
    }
  }, [selectedCategory, navigation]);

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

  const renderStepCard = () => (
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
  );

  // Estimated from the step count, never measured (#273): there is no height or
  // weight input anywhere in the app. Gated by the same `showSteps` as the step
  // count so "no permission" and "no data" print the same em dash — printing
  // "0.0 km" would read as a measurement of a day spent standing still.
  const renderEstimatesCard = () => (
    <CupertinoCard title="Distance & Energy" subtitle="Estimated from steps today">
      <View style={styles.stepsRow}>
        <Ionicons name="map" size={22} color="#34C759" />
        <Text
          style={[typography.title2, { color: colors.label, marginLeft: spacing.sm }]}
          accessibilityLabel="Estimated distance today"
        >
          {showSteps ? `${todayDistanceKm.toFixed(1)} km` : '—'}
        </Text>
      </View>
      <View style={[styles.stepsRow, { marginTop: spacing.sm }]}>
        <Ionicons name="flame" size={22} color="#FF9500" />
        <Text
          style={[typography.title2, { color: colors.label, marginLeft: spacing.sm }]}
          accessibilityLabel="Estimated active energy today"
        >
          {showSteps ? `${Math.round(todayActiveEnergyKcal)} kcal` : '—'}
        </Text>
      </View>
      <Text style={[typography.footnote, { color: colors.secondaryLabel, marginTop: spacing.sm }]}>
        Estimated from your step count using population averages, not measured.
      </Text>
    </CupertinoCard>
  );

  const renderSummary = () => (
    <>
      {renderStepCard()}
      {renderEstimatesCard()}
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
    </>
  );

  const renderCategoryDetail = () => {
    if (selectedCategory === 'activity') {
      return (
        <CupertinoCard title="Activity" subtitle="Today">
          <View style={styles.stepsRow}>
            <Ionicons name="footsteps" size={26} color="#FF3B30" />
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
        </CupertinoCard>
      );
    }

    const cat = HEALTH_CATEGORIES.find((c) => c.key === selectedCategory);
    if (!cat) return null;
    const message = EMPTY_MESSAGES[selectedCategory as Exclude<CategoryKey, 'activity'>];
    return (
      <CupertinoEmptyState icon={cat.icon} iconColor={cat.color} title="No data yet" message={message} />
    );
  };

  const renderBrowse = () => (
    <CupertinoListSection header="Categories">
      {HEALTH_CATEGORIES.map((cat) => (
        <CupertinoListTile
          key={cat.key}
          title={cat.title}
          leading={{ name: cat.icon, color: '#FFFFFF', backgroundColor: cat.color }}
          showChevron
          onPress={() => setSelectedCategory(cat.key)}
        />
      ))}
    </CupertinoListSection>
  );

  const title = selectedCategory
    ? HEALTH_CATEGORIES.find((c) => c.key === selectedCategory)?.title ?? 'Health'
    : 'Health';

  return (
    <BackEdgeSwipe>
      <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        <CupertinoNavigationBar
          title={title}
          largeTitle={false}
          leftButton={
            <Pressable
              onPress={handleBack}
              style={{ flexDirection: 'row', alignItems: 'center' }}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <Ionicons name="chevron-back" size={28} color={colors.systemBlue} />
            </Pressable>
          }
        />

        <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 90 }}>
          {selectedCategory ? (
            renderCategoryDetail()
          ) : (
            <>
              <CupertinoSegmentedControl
                values={['Summary', 'Browse']}
                selectedIndex={segment}
                onChange={setSegment}
                testID="health-segment"
              />
              <View style={{ marginTop: spacing.md }}>
                {segment === 0 ? renderSummary() : renderBrowse()}
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </BackEdgeSwipe>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  stepsRow: { flexDirection: 'row', alignItems: 'center' },
});
