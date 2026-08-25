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
import {
  SMART_BATTERY_PROFILES,
  resolveActiveProfile,
  getProfileEffects,
  SMART_BATTERY_THRESHOLD_MIN,
  SMART_BATTERY_THRESHOLD_MAX,
} from '../../utils/smartBatteryProfiles';
import type { AppNavigationProp } from '../../navigation/types';

function getBatteryColor(level: number): string {
  if (level > 20) return '#34C759';
  if (level > 10) return '#FFCC00';
  return '#FF3B30';
}

function getBatteryIcon(level: number, isCharging: boolean): 'battery-full-outline' | 'battery-half-outline' | 'battery-dead-outline' | 'battery-charging-outline' {
  if (isCharging) return 'battery-charging-outline';
  if (level > 50) return 'battery-full-outline';
  if (level > 20) return 'battery-half-outline';
  return 'battery-dead-outline';
}

export function BatteryScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing, textScale } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update, updateMany } = useSettings();
  const { battery } = useDevice();

  const batteryLevel = Math.round(battery.level * 100);
  const batteryColor = getBatteryColor(batteryLevel);
  const batteryIcon = getBatteryIcon(batteryLevel, battery.isCharging);

  // Trigger automático: resolve o perfil efectivo para mostrar o badge
  // "Automatic" quando o saver duro entrou em ação.
  const resolved = resolveActiveProfile(batteryLevel, battery.isCharging, {
    autoEnabled: settings.autoBatteryProfile,
    threshold: settings.smartBatteryThreshold,
    manualProfile: settings.smartBatteryProfile,
  });
  const automaticActive = resolved.automatic && resolved.profile === 'extremeSaver';

  // A matriz de efeitos (lowPowerMode/backgroundAppRefresh) só é significativa
  // se aplicada aos settings reais. Quando o trigger automático dispara, ele
  // sobrepõe-se ao perfil manual e os efeitos têm de seguir — não só o badge.
  React.useEffect(() => {
    if (resolved.automatic) {
      updateMany(getProfileEffects(resolved.profile));
    }
  }, [resolved.automatic, resolved.profile, updateMany]);

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
          <Text style={[styles.batteryPercent, { color: batteryColor, fontSize: 48 * textScale }]}>
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

        {/* Smart Battery Profiles (#631) */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            header="Smart Battery Profiles"
            footer={
              automaticActive
                ? `Automatic saver active: battery below ${settings.smartBatteryThreshold}%.`
                : `Automatic Extreme Saver triggers below ${settings.smartBatteryThreshold}% when not charging.`
            }
          >
            <CupertinoListTile
              title="Automatic (below threshold)"
              subtitle={`Trigger at ${settings.smartBatteryThreshold}%`}
              trailing={
                <CupertinoSwitch
                  value={settings.autoBatteryProfile}
                  onValueChange={(v) => update('autoBatteryProfile', v)}
                />
              }
              showChevron={false}
            />
            {SMART_BATTERY_PROFILES.map((profile) => {
              const isActive = settings.smartBatteryProfile === profile.id && !automaticActive;
              return (
                <View
                  key={profile.id}
                  testID={`battery-profile-row-${profile.id}`}
                >
                  <CupertinoListTile
                    title={profile.label}
                    subtitle={profile.description}
                    leading={{ name: profile.icon as never, color: colors.systemBlue, backgroundColor: colors.systemGray5 }}
                    trailing={
                      isActive ? (
                        <View testID="battery-profile-check">
                          <Ionicons
                            name="checkmark"
                            size={18}
                            color={colors.systemBlue}
                          />
                        </View>
                      ) : undefined
                    }
                    showChevron={false}
                    onPress={() => {
                      update('smartBatteryProfile', profile.id);
                      updateMany(getProfileEffects(profile.id));
                    }}
                  />
                </View>
              );
            })}
          </CupertinoListSection>
        </View>

        {/* Battery Usage */}
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

// Re-export for tests / consumers that want the limits without importing the util directly.
export { SMART_BATTERY_THRESHOLD_MIN, SMART_BATTERY_THRESHOLD_MAX };
