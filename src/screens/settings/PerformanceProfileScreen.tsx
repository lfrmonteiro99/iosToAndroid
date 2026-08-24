import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSegmentedControl,
} from '../../components';
import {
  PERFORMANCE_PROFILES,
  PERFORMANCE_PROFILE_LABELS,
  PERFORMANCE_PROFILE_ORDER,
  getPerformanceProfileTriggers,
  performanceProfileIndex,
  normalizePerformanceProfile,
} from '../../utils/performanceProfile';
import type { AppNavigationProp } from '../../navigation/types';

/**
 * Performance-profile picker (#631 child).
 *
 * One `CupertinoSegmentedControl` exposes the five profiles
 * (Normal / Performance / Saver / Sleep / Travel). Selecting one records the
 * choice in `settings.performanceProfile` AND fires that profile's *triggers*
 * through `updateMany`, so the rest of the app reacts immediately (Low Power
 * Mode, transparency, white point, location). The displayed description tracks
 * the active profile.
 */
export function PerformanceProfileScreen({ navigation }: { navigation?: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update, updateMany } = useSettings();

  const activeProfile = normalizePerformanceProfile(settings.performanceProfile);
  const selectedIndex = performanceProfileIndex(activeProfile);
  const activeDef = PERFORMANCE_PROFILES[activeProfile];

  const handleSelect = (index: number) => {
    const profile = PERFORMANCE_PROFILE_ORDER[index];
    if (!profile) return;
    update('performanceProfile', profile);
    updateMany(getPerformanceProfileTriggers(profile));
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Performance Profile"
        leftButton={
          <Text
            style={[typography.body, { color: colors.systemBlue }]}
            onPress={() => navigation?.goBack()}
          >
            Settings
          </Text>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.sm }}>
          <CupertinoListSection header="Profile">
            <View style={styles.controlRow}>
              <CupertinoSegmentedControl
                values={PERFORMANCE_PROFILE_LABELS}
                selectedIndex={selectedIndex}
                onChange={handleSelect}
                testID="performance-profile-segmented"
              />
            </View>
          </CupertinoListSection>

          {/* Active profile description — the inverse of the picker's selected state. */}
          <CupertinoListSection>
            <CupertinoListTile
              title={activeDef.label}
              subtitle={activeDef.description}
              leading={{
                name: 'speedometer',
                color: '#FFFFFF',
                backgroundColor: colors.accent,
              }}
              showChevron={false}
            />
          </CupertinoListSection>

          {/* The individual settings each profile drives, so the user sees what
              the triggers will change without hunting through other screens. */}
          <CupertinoListSection header="This profile adjusts">
            {activeProfile === 'normal' ? (
              <CupertinoListTile
                title="No automatic changes"
                subtitle="Normal leaves every setting as you set it."
                leading={{ name: 'checkmark-circle', color: '#FFFFFF', backgroundColor: '#8E8E93' }}
                showChevron={false}
              />
            ) : (
              <React.Fragment>
                <CupertinoListTile
                  title="Low Power Mode"
                  trailing={<Text style={[typography.body, { color: colors.secondaryLabel }]}>{activeDef.triggers.lowPowerMode ? 'On' : 'Off'}</Text>}
                  leading={{ name: 'battery-half', color: '#FFFFFF', backgroundColor: '#34C759' }}
                  showChevron={false}
                />
                {activeDef.triggers.reduceTransparency !== undefined && (
                  <CupertinoListTile
                    title="Reduce Transparency"
                    trailing={<Text style={[typography.body, { color: colors.secondaryLabel }]}>{activeDef.triggers.reduceTransparency ? 'On' : 'Off'}</Text>}
                    leading={{ name: 'layers', color: '#FFFFFF', backgroundColor: '#5856D6' }}
                    showChevron={false}
                  />
                )}
                {activeDef.triggers.reduceWhitePoint !== undefined && (
                  <CupertinoListTile
                    title="Reduce White Point"
                    trailing={<Text style={[typography.body, { color: colors.secondaryLabel }]}>{activeDef.triggers.reduceWhitePoint ? 'On' : 'Off'}</Text>}
                    leading={{ name: 'sunny', color: '#FFFFFF', backgroundColor: '#FF9500' }}
                    showChevron={false}
                  />
                )}
                {activeDef.triggers.locationServices !== undefined && (
                  <CupertinoListTile
                    title="Location Services"
                    trailing={<Text style={[typography.body, { color: colors.secondaryLabel }]}>{activeDef.triggers.locationServices ? 'On' : 'Off'}</Text>}
                    leading={{ name: 'location', color: '#FFFFFF', backgroundColor: colors.accent }}
                    showChevron={false}
                  />
                )}
              </React.Fragment>
            )}
          </CupertinoListSection>

          <Text style={[typography.footnote, styles.footer, { color: colors.secondaryLabel }]}>
            Selecting a profile applies its settings immediately and saves your choice.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  controlRow: { padding: 12 },
  footer: {
    marginHorizontal: 32,
    marginTop: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
});
