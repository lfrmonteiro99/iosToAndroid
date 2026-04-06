import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import { useDevice } from '../../store/DeviceStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
} from '../../components';

function getBatteryColor(level: number): string {
  if (level > 20) return '#34C759';
  if (level > 10) return '#FFCC00';
  return '#FF3B30';
}

function getBatteryIcon(level: number, isCharging: boolean): 'battery-full' | 'battery-half' | 'battery-dead' | 'battery-charging' {
  if (isCharging) return 'battery-charging';
  if (level > 50) return 'battery-full';
  if (level > 20) return 'battery-half';
  return 'battery-dead';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function BatteryScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const { battery, openSystemPanel } = useDevice();

  const batteryLevel = Math.round(battery.level * 100);
  const batteryColor = getBatteryColor(batteryLevel);
  const batteryIcon = getBatteryIcon(batteryLevel, battery.isCharging);

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
          <Ionicons name={batteryIcon} size={64} color={batteryColor} />
          <Text style={[styles.batteryPercent, { color: batteryColor }]}>
            {batteryLevel}%
          </Text>
          <Text style={[typography.footnote, { color: colors.secondaryLabel, marginTop: 4 }]}>
            {battery.isCharging ? 'Charging' : 'Not Charging'}
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

        {/* Battery Usage */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Battery Usage">
            <CupertinoListTile
              title="View Battery Usage"
              leading={{
                name: 'bar-chart-outline',
                color: '#FFFFFF',
                backgroundColor: colors.systemGreen ?? '#34C759',
              }}
              onPress={() => openSystemPanel('battery')}
            />
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
  footer: {
    marginHorizontal: 32,
    marginTop: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
});
