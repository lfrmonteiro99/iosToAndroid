import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, NativeModules, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import { useDevice } from '../../store/DeviceStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
} from '../../components';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function LanguageRegionScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { openSystemPanel } = useDevice();

  const trailing = (text: string) => (
    <Text style={[typography.body, { color: colors.secondaryLabel }]}>{text}</Text>
  );

  // Derive locale-based values from the JS runtime
  const localeInfo = useMemo(() => {
    const locale = Platform.OS === 'android'
      ? (NativeModules.I18nManager?.localeIdentifier ?? 'en_US')
      : 'en_US';
    const usesMetric = !['US', 'LR', 'MM'].includes(settings.region);
    const tempUnit = usesMetric ? '°C' : '°F';
    const measurement = usesMetric ? 'Metric' : 'US';
    // Format a sample number using the device locale
    let numberFormat = '1,234.56';
    try { numberFormat = (1234.56).toLocaleString(locale.replace('_', '-')); } catch { /* ignore */ }
    return { tempUnit, measurement, numberFormat };
  }, [settings.region]);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Language & Region"
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
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection
            footer="Apps that support the selected language will use it."
          >
            <CupertinoListTile
              title="Preferred Language"
              trailing={trailing(settings.language)}
              onPress={() => openSystemPanel('locale')}
            />
            <CupertinoListTile
              title="Region"
              trailing={trailing(settings.region)}
              onPress={() => openSystemPanel('locale')}
            />
            <CupertinoListTile
              title="Calendar"
              trailing={trailing('Gregorian')}
              onPress={() => openSystemPanel('locale')}
            />
            <CupertinoListTile
              title="Temperature"
              trailing={trailing(localeInfo.tempUnit)}
              onPress={() => openSystemPanel('locale')}
            />
            <CupertinoListTile
              title="Measurement System"
              trailing={trailing(localeInfo.measurement)}
              onPress={() => openSystemPanel('locale')}
            />
            <CupertinoListTile
              title="Number Format"
              trailing={trailing(localeInfo.numberFormat)}
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Open System Settings */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Open Language Settings"
              leading={{ name: 'open-outline', color: '#FFF', backgroundColor: colors.systemBlue }}
              onPress={() => openSystemPanel('locale')}
            />
          </CupertinoListSection>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
