import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../theme/ThemeContext';
import { useHealth } from '../store/HealthStore';
import {
  CupertinoNavigationBar,
  CupertinoCard,
  CupertinoButton,
  CupertinoSegmentedControl,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoEmptyState,
  BackEdgeSwipe,
} from '../components';
import type { AppNavigationProp } from '../navigation/types';

/**
 * Minimal Health slice (#271): today's step count from the device pedometer and
 * nothing else. No mock data — before permission is granted (or when the device
 * has no step-counter at all) the count reads `—`, never an invented number.
 *
 * #275 adds a `Browse` tab listing health categories. Activity is the only one
 * with a real data source; the other four render an honest empty state instead
 * of invented numbers (the epic explicitly forbids fake data).
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
  const { todaySteps, isPedometerAvailable, permissionGranted, requestActivityPermission, isReady } = useHealth();

  const [segment, setSegment] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(null);

  const showSteps = permissionGranted === true;
  const needsPermission = isReady && isPedometerAvailable && permissionGranted !== true;
  const sensorMissing = isReady && !isPedometerAvailable;

  const handleGrant = useCallback(() => {
    void requestActivityPermission();
  }, [requestActivityPermission]);

  const handleBack = useCallback(() => {
    if (selectedCategory) {
      setSelectedCategory(null);
    } else {
      navigation.goBack();
    }
  }, [selectedCategory, navigation]);

  const renderSummary = () => (
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
    </CupertinoCard>
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
      <CupertinoEmptyState
        icon={cat.icon}
        iconColor={cat.color}
        title="No data yet"
        message={message}
      />
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
