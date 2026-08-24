import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useHealth } from '../store/HealthStore';
import { CupertinoNavigationBar, CupertinoCard, CupertinoButton } from '../components';

/**
 * Placeholder used everywhere a figure is not a real reading. Zero steps and
 * "no data" must look identical: the app never prints `0`, `0.0 km` or `0 kcal`
 * as though it had measured them.
 */
const NO_DATA = '—';

export function HealthScreen() {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const {
    todaySteps,
    todayDistanceKm,
    todayActiveEnergyKcal,
    isPedometerAvailable,
    permissionGranted,
    requestActivityPermission,
  } = useHealth();

  const hasSteps = todaySteps > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar title="Health" />
      <ScrollView
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
      >
        <CupertinoCard title="Activity">
          <Text style={[typography.largeTitle, { color: colors.label }]}>
            {hasSteps ? String(todaySteps) : NO_DATA}
          </Text>
          <Text style={[typography.subhead, { color: colors.secondaryLabel }]}>steps today</Text>
        </CupertinoCard>

        <CupertinoCard
          title="Distance"
          subtitle="Estimated from steps"
          style={{ marginTop: spacing.md }}
        >
          <Text style={[typography.title2, { color: colors.label }]}>
            {hasSteps ? `${todayDistanceKm.toFixed(1)} km` : NO_DATA}
          </Text>
        </CupertinoCard>

        <CupertinoCard
          title="Active Energy"
          subtitle="Estimated from steps"
          style={{ marginTop: spacing.md }}
        >
          <Text style={[typography.title2, { color: colors.label }]}>
            {hasSteps ? `${Math.round(todayActiveEnergyKcal)} kcal` : NO_DATA}
          </Text>
        </CupertinoCard>

        {!isPedometerAvailable && (
          <Text
            style={[
              typography.footnote,
              { color: colors.secondaryLabel, marginTop: spacing.md },
            ]}
          >
            Step counting is not available on this device.
          </Text>
        )}

        {isPedometerAvailable && permissionGranted !== true && (
          <View style={{ marginTop: spacing.lg }}>
            <CupertinoButton
              title="Grant Activity Permission"
              variant="filled"
              onPress={requestActivityPermission}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
