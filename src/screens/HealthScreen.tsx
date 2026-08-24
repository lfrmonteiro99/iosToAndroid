import React, { useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../theme/ThemeContext';
import { useHealth } from '../store/HealthStore';
import { CupertinoNavigationBar, CupertinoCard, CupertinoButton, BackEdgeSwipe } from '../components';
import type { AppNavigationProp } from '../navigation/types';

/**
 * Minimal Health slice (#271): today's step count from the device pedometer and
 * nothing else. No mock data — before permission is granted (or when the device
 * has no step-counter at all) the count reads `—`, never an invented number.
 */
export function HealthScreen() {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<AppNavigationProp>();
  const { todaySteps, isPedometerAvailable, permissionGranted, requestActivityPermission, isReady } = useHealth();

  const showSteps = permissionGranted === true;
  const needsPermission = isReady && isPedometerAvailable && permissionGranted !== true;
  const sensorMissing = isReady && !isPedometerAvailable;

  const handleGrant = useCallback(() => {
    void requestActivityPermission();
  }, [requestActivityPermission]);

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
