import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
} from '../../components';

const BATTERY_LEVEL = 72;

const APP_USAGE = [
  { name: 'Safari', pct: 35, color: '#007AFF' },
  { name: 'Messages', pct: 22, color: '#34C759' },
  { name: 'Instagram', pct: 18, color: '#FF375F' },
  { name: 'Music', pct: 12, color: '#FF2D55' },
  { name: 'Other', pct: 13, color: '#8E8E93' },
];

function getBatteryColor(level: number): string {
  if (level > 20) return '#34C759';
  if (level > 10) return '#FFCC00';
  return '#FF3B30';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function BatteryScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();

  const batteryColor = getBatteryColor(BATTERY_LEVEL);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Battery"
        leftButton={
          <Text
            style={[typography.body, { color: colors.systemBlue }]}
            onPress={() => navigation.goBack()}
          >
            Settings
          </Text>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Battery level display */}
        <View style={[styles.batteryDisplay, { backgroundColor: colors.secondarySystemGroupedBackground }]}>
          <Ionicons name="battery-half" size={64} color={batteryColor} />
          <Text style={[styles.batteryPercent, { color: batteryColor }]}>
            {BATTERY_LEVEL}%
          </Text>
          <Text style={[typography.footnote, { color: colors.secondaryLabel, marginTop: 4 }]}>
            Battery Level
          </Text>
        </View>

        {/* Toggles */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Low Power Mode"
              trailing={
                <CupertinoSwitch
                  value={settings.lowPowerMode}
                  onValueChange={(v) => update('lowPowerMode', v)}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Battery Percentage"
              trailing={
                <CupertinoSwitch
                  value={settings.batteryPercentage}
                  onValueChange={(v) => update('batteryPercentage', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Last Charged */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Last Charged"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  Today at 8:30 AM
                </Text>
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Battery Usage */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Battery Usage">
            {APP_USAGE.map((app) => (
              <CupertinoListTile
                key={app.name}
                title={app.name}
                trailing={
                  <View style={styles.barContainer}>
                    <Text style={[typography.footnote, { color: colors.secondaryLabel, marginRight: 6 }]}>
                      {app.pct}%
                    </Text>
                    <View style={[styles.barTrack, { backgroundColor: colors.systemFill }]}>
                      <View
                        style={[
                          styles.barFill,
                          { width: `${app.pct}%` as unknown as number, backgroundColor: app.color },
                        ]}
                      />
                    </View>
                  </View>
                }
                showChevron={false}
              />
            ))}
          </CupertinoListSection>
        </View>

        {/* Footer */}
        <Text style={[typography.footnote, styles.footer, { color: colors.secondaryLabel }]}>
          Battery usage data is calculated since last full charge.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  batteryDisplay: {
    alignItems: 'center',
    paddingVertical: 28,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 12,
  },
  batteryPercent: {
    fontSize: 48,
    fontWeight: '700',
    lineHeight: 56,
  },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 140,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  footer: {
    marginHorizontal: 32,
    marginTop: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
});
